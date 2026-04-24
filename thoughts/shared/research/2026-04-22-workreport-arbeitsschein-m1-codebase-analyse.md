---
date: 2026-04-22T21:57:59+02:00
researcher: tolga
git_commit: 9b86c4de9760b757fc7ccea7f719b663ffbee388
branch: staging
repository: terp
topic: "WorkReport — Arbeitsschein mit Signatur und PDF (M-1): Codebase-Bestandsaufnahme"
tags: [research, codebase, workreport, arbeitsschein, service-object, order, pdf, signature, attachments, audit, immutability, i18n]
status: complete
last_updated: 2026-04-22
last_updated_by: tolga
---

# Research: WorkReport — Arbeitsschein mit Signatur und PDF (M-1)

**Date**: 2026-04-22T21:57:59+02:00
**Researcher**: tolga
**Git Commit**: 9b86c4de9760b757fc7ccea7f719b663ffbee388
**Branch**: staging
**Repository**: terp

## Research Question

Bestandsaufnahme des Codebase vor Einführung der WorkReport-Entität
(Arbeitsschein). Ticket M-1 plant eine neue Entität mit FK auf `Order`
und `ServiceObject`, mehrere Einsätze pro Auftrag (1:n), Pflicht-/
Optional-Felder inkl. Foto-Anhängen, Kundensignatur (Canvas → Base64
PNG), PDF-Generierung und DRAFT → SIGNED → VOID Status-Transitions.
Dokumentiert werden 7 Blöcke (Order-Lifecycle, File-Upload, PDF,
Audit/Immutability, Berechtigungen, UI-Patterns, i18n) — **ohne
Lösungs-Vorschläge**, nur Befunde mit Datei/Zeile-Referenzen.

## Summary

Der Codebase ist in allen untersuchten Bereichen gut ausgestattet für
den WorkReport-Feature, mit einer Ausnahme: **Canvas-basierte UI
(Signatur-Zeichnung) existiert nirgends**. Eine neue Dependency
(z.B. `signature_pad` / `react-signature-canvas`) und ein neuer
Component müssten eingeführt werden.

Die wichtigsten wiederverwendbaren Patterns:

- **Order-Lifecycle** (`Order.status` als String mit DB-CHECK, 4
  Werte: `planned`, `active`, `completed`, `cancelled`) — generisches
  `update()`, **keine dedizierte `complete()`-Funktion**. Status-
  Transition `→ completed` triggert `serviceScheduleService.recordCompletion()`
  (best-effort, ausserhalb Transaction).
- **`Order.serviceObjectId`** bereits verdrahtet (nullable FK), Filter
  im `list`-Router, `findManyByServiceObject`-Query vorhanden.
- **Booking-Aggregation** `getBookingSummariesByOrders()` liefert
  `{ totalMinutes, bookingCount, lastBookingDate }` — **keine
  Mitarbeiter-Liste** in der Aggregation.
- **File-Upload**: kein generisches Attachment-Modell, sondern 4
  zweck-spezifische Prisma-Modelle nach dem gleichen Schema.
  3-Step-Pattern (`getUploadUrl` → direct PUT → `confirmUpload`).
  Keine Client-side Komprimierung, kein Virus-Scan.
- **Supabase Storage**: 10 Buckets, alle privat ausser `tenant-logos`/
  `avatars`. **Keine RLS-Policies** auf `storage.objects` — Access
  Control komplett App-Layer via Service-Role-Key. Storage-Helper in
  `src/lib/supabase/storage.ts`.
- **PDF-Pipeline**: `@react-pdf/renderer` v4.3.2, `renderToBuffer()`,
  synchron im Request, Upload in Bucket `documents`. Shared Sub-
  Components (`FusszeilePdf`, `PositionTablePdf`, `TotalsSummaryPdf`).
  Tenant-Branding via `BillingTenantConfig`. **PDFs sind komplett
  hardcodiert Deutsch** — `next-intl` wird nirgends in `src/lib/pdf/`
  importiert, alle Labels sind String-Literals, alle `Intl.*` Formatter
  verwenden `"de-DE"`.
- **Audit-Log**: explizite `auditLog.log(...)`-Aufrufe in Services,
  fire-and-forget, keine Prisma-Middleware. `computeChanges(before,
  after, fields)` liefert Diff-Objekt. Platform-Admin-Actions schreiben
  nach `platform_audit_logs` via `getImpersonation()` Dual-Write.
- **Immutability**: Service-level Guards (`throw` bei `status !==
  "DRAFT"`), gehärtet mit atomarer `updateMany`-Status-Condition gegen
  Race-Conditions (`billing-document-service.ts`). Keine DB-CHECK-
  Constraints auf Status-Transitions.
- **Field-Encryption** (AES-256-GCM, `v{n}:iv:tag:ct` Format): heute
  nur für **Short-String-PII** eingesetzt (taxId, iban, SSN,
  garnishment-Daten). Typische Payload 20–50 Zeichen → ~75–80
  Zeichen Ciphertext.
- **Permissions**: `orders.manage` als Single-Permission für alle
  Order-Operationen (kein separates Create/Update/Delete). ServiceObject
  hat granulare `view`/`manage`/`delete`. Middleware
  `requirePermission(...)` nach `tenantProcedure`.
- **N:m Mitarbeiter-Zuweisung**: 3 existierende Patterns —
  `OrderAssignment` (mit Rollen, Zeitfenster, inkrementell),
  `CrmTaskAssignee` (Employee+Team, wipe+recreate), `ShiftAssignment`
  (kein dedizierter Service).
- **Active-User-Tracking**: `createdById` auf ~40 Modellen, aber
  **NICHT auf Order**. `updatedById` nur auf `ServiceSchedule`. Keine
  automatische Middleware — jeder Service setzt manuell via
  `audit?.userId ?? null` oder `ctx.user!.id`.
- **Wizard-Patterns**: kein `react-hook-form`, reines
  `useState`-basiert. 3 existierende Patterns: Discriminated-Union
  (Login/MFA), numerischer Step (Warehouse-Terminals),
  String-Enum-Step (Cleanup-Dialog). **Keine Autosave oder
  LocalStorage-Drafts** — DRAFT-Status ist rein server-seitig.
- **i18n**: `de` + `en`, Default `de`. Platform-Admin `/platform/*`
  explizit vom `intlMiddleware` ausgenommen (hardcoded Deutsch).
  PDFs nutzen `next-intl` nicht — alle Strings hartkodiert in
  `src/lib/pdf/`. Kein `locale`-Feld auf `Tenant` oder `User`.

## Detailed Findings

---

### Block 1 — Order-Workflow und ServiceObject-Verdrahtung

#### 1.1 Order-Lifecycle

**Prisma-Modell** — `prisma/schema.prisma:2548-2587`

Felder (relevante Auswahl):
- `id` UUID (gen_random_uuid)
- `tenantId` UUID (FK Tenant)
- `code` VarChar 50, unique per tenant
- `name` VarChar 255, required
- `description` Text, nullable
- `status` VarChar 20, **DB CHECK** `IN ('planned','active','completed','cancelled')`, default `'active'`
- `customer` VarChar 255, nullable
- `costCenterId` UUID, FK CostCenter, SetNull
- `billingRatePerHour` Decimal(10,2), nullable
- `validFrom` Date, nullable
- `validTo` Date, nullable
- `isActive` Boolean, default true
- **`serviceObjectId` UUID, FK ServiceObject, SetNull** — vorhanden seit T-1
- **`serviceScheduleId` UUID, FK ServiceSchedule, SetNull** — vorhanden seit T-3

**Relations** (`schema.prisma:2566-2577`):
- `assignments → OrderAssignment[]`
- `orderBookings → OrderBooking[]`
- `defaultForEmployees → Employee[]` via `"EmployeeDefaultOrder"`
- `serviceObject`, `serviceSchedule` (beide nullable, SetNull)
- `billingDocuments → BillingDocument[]`
- `billingServiceCases → BillingServiceCase[]`
- `inboundInvoices → InboundInvoice[]`
- `crmInquiries → CrmInquiry[]`

**Status-Enum existiert NICHT als Prisma-Enum** — es ist ein `String`
mit DB-CHECK. Schema-Kommentar bei `schema.prisma:2545` dokumentiert
die 4 erlaubten Werte. Der Router akzeptiert `z.string().max(50)`
(`src/trpc/routers/orders.ts:65,80`) — kein Zod-Enum.

**Status wird an zwei Stellen geschrieben:**

- **Create** (`src/lib/services/order-service.ts:139`): `status: input.status || "active"` — Default `"active"` wenn Caller nichts setzt.
- **Update** (`src/lib/services/order-service.ts:239-241`): Generisches Partial-Update; `if (input.status !== undefined) data.status = input.status`.

**Keine dedizierten Transition-Methoden** (`complete()`, `cancel()`,
`activate()` existieren nicht). Alle Transitions laufen über den einen
`update()`-Call.

**Guards auf Service-Level** (`order-service.ts`):
- `code` non-empty nach trim (`:108-110`, `:205-208`)
- `name` non-empty nach trim (`:113-116`, `:224-229`)
- `code` unique per Tenant (`:119-121`, `:209-219`)
- `serviceObjectId` Cross-Tenant-Ownership-Check (`:129-131`, `:280-284`)

**Kein State-Machine-Guard** — es gibt keinen Check, ob der aktuelle
Status einen Übergang erlaubt (z.B. `cancelled → active` ist im Code
nicht verboten).

**Side-Effect auf Transition** (`order-service.ts:308-337`):

Wenn `update()` erkennt, dass `data.status === "completed"` AND
`existing.status !== "completed"`, UND `existing.serviceScheduleId`
non-null ist, wird aufgerufen:

```ts
await serviceScheduleService.recordCompletion(
  prisma, tenantId, existing.serviceScheduleId, new Date(), audit,
)
```

Läuft **nach** dem DB-Update, **ausserhalb** jeder Transaction, Fehler
werden mit `console.warn` geschluckt (nicht re-thrown).

**Audit-Log** wird bei jedem `create`, `update`, `remove` via
`auditLog.log(...)` geschrieben (`order-service.ts:152-163`, `:290-305`,
`:361-372`). **`status` ist NICHT in `TRACKED_FIELDS`** (`:16-20`) —
Status-Änderungen erscheinen im Diff-Objekt der Audit-Einträge nicht,
aber die `action:"update"` Row wird trotzdem geschrieben.

**Keine E-Mails, keine Notifications** bei Order-Status-Transitions.

**Keine per-Status Pflichtfelder** — `code` und `name` sind die einzig
erforderlichen Felder (beim Create).

#### 1.2 Order-Abschluss

Es gibt **keine dedizierte `complete()`/`finish()`/`close()`-Funktion**.
Abschluss erfolgt via `orders.update` tRPC-Prozedur
(`src/trpc/routers/orders.ts:232-248`) → `orderService.update()`
(`src/lib/services/order-service.ts:174`) mit `{ id, status: "completed" }`.

Validierung vor Abschluss: nur Existenz-Check via `findById`
(`order-service.ts:194-197`). Keine Geschäftsregel-Guards auf dem
aktuellen Status.

Der einzige dedizierte Effect bei `→ completed` ist
`serviceSchedule.recordCompletion()` (siehe oben).

**UI**: Die Detail-Seite
`src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` hat **keinen
"Auftrag abschließen"-Button**. Status wird über das generische Edit-
Formular (`OrderFormSheet`) als Select-Feld geändert.

#### 1.3 ServiceObject ↔ Order Verdrahtung

**`Order.serviceObjectId`** (`schema.prisma:2563`): `String? @map("service_object_id") @db.Uuid`.

**Geschrieben**:
- Create: `order-service.ts:149` — `serviceObjectId: input.serviceObjectId ?? null`
- Update: `order-service.ts:280-284` — wenn `input.serviceObjectId !== undefined`, wird Tenant-Ownership via `validateServiceObject()` geprüft (`:51-65`), dann gesetzt. Wirft `OrderValidationError` wenn ServiceObject nicht im Tenant.

**Routing-Filter**:
- `src/trpc/routers/orders.ts:147-168` — `list`-Procedure akzeptiert optional `serviceObjectId: z.string().uuid()` (Zeile 154)
- `src/lib/services/order-service.ts:69-75` — `list()` reicht `serviceObjectId` an Repo weiter
- `src/lib/services/order-repository.ts:29-31` — `findMany()` fügt `where.serviceObjectId` hinzu wenn Parameter gesetzt

**ServiceObject → Order Queries**:

1. `orderRepo.findManyByServiceObject` — `src/lib/services/order-repository.ts:40-66`
   - Signatur: `(prisma, tenantId, serviceObjectId, limit)`
   - Query: `order.findMany({ where: { tenantId, serviceObjectId }, orderBy: { createdAt: "desc" }, take: limit })` inkl. `costCenter` + `assignments` mit Employee-Details
2. `serviceObjectRepo.countLinkedOrders` — `src/lib/services/service-object-repository.ts:185-193` (für Soft vs Hard Delete)

`serviceObjectService.getHistoryByServiceObject()` (`service-object-service.ts:826-913`) ruft `orderRepo.findManyByServiceObject` bei `:839` auf; exponiert als `serviceObjects.getHistory` im Router (`serviceObjects.ts:111-130`).

**ServiceObject-Modell** — `schema.prisma:914-977`:
- Felder: `number` (VarChar 50, unique per tenant), `name`, `kind`
  (Enum: `SITE | BUILDING | SYSTEM | EQUIPMENT | COMPONENT`), `parentId`
  (selbstreferentiell, Baum), `customerAddressId` (FK CrmAddress, NOT
  NULL), technische Felder (`manufacturer`, `model`, `serialNumber`),
  Site-Felder, `status` (Enum: `OPERATIONAL | DEGRADED | IN_MAINTENANCE
  | OUT_OF_SERVICE | DECOMMISSIONED`), `isActive`, `qrCodePayload`
- Relations: `parent`/`children`, `customerAddress`, `attachments`,
  `orders` (Back-Relation), `stockMovements`, `schedules`

ServiceObject-Router-Procedures: `list`, `getById`, `getTree`,
`getHistory`, `create`, `update`, `move`, `delete`, `getAttachments`,
`getUploadUrl`, `confirmUpload`, `getDownloadUrl`, `deleteAttachment`,
`generateSingleQr`, `generateQrPdf`, `scanByQr`, `importPreview`,
`importCommit`.

#### 1.4 Booking-Aggregation (nach T-2)

**Datei**: `src/lib/services/order-booking-aggregator.ts`

**Zwei Exports**:

1. `getBookingSummaryByOrder(prisma, tenantId, orderId): Promise<OrderBookingSummary>` (`:17-36`)
   - Ein `prisma.orderBooking.groupBy` mit `_sum.timeMinutes`, `_count`, `_max.bookingDate`
   - **Derzeit kein Aufrufer im Service-Code** — Utility-Export

2. `getBookingSummariesByOrders(prisma, tenantId, orderIds[]): Promise<Map<string, OrderBookingSummary>>` (`:38-73`)
   - Ein `groupBy` für alle `orderIds` (`orderId: { in: orderIds }`)
   - Befüllt leere Order-IDs mit Null-Summary
   - Aufgerufen in `service-object-service.ts:852-856` via `getHistoryByServiceObject`

**Rückgabetyp** (`:10-15`):
```ts
type OrderBookingSummary = {
  orderId: string
  totalMinutes: number
  bookingCount: number
  lastBookingDate: Date | null
}
```

**WICHTIG**: Die Aggregation liefert **nur** Gesamtminuten + Anzahl +
letztes Datum. **Keine Mitarbeiter-Liste pro Order**. Employee-Info
kommt separat via `assignments`-Relation in `findManyByServiceObject`.

---

### Block 2 — File-Upload- und Storage-Infrastruktur

#### 2.1 File-Upload Entities

**Kein generisches `FileUpload` / `Attachment` / `File` / `Document` Modell**. Stattdessen 4 zweck-spezifische Prisma-Modelle nach dem gleichen Schema.

| Model | Schema-Zeile | Bucket | Felder (Kern) |
|---|---|---|---|
| `CrmCorrespondenceAttachment` | `schema.prisma:~739` | `crm-attachments` | `correspondenceId`, `tenantId`, `filename`, `storagePath`, `mimeType`, `sizeBytes`, `createdById`, `createdAt` |
| `ServiceObjectAttachment` | `schema.prisma:~979` | `serviceobject-attachments` | `serviceObjectId`, `tenantId`, `filename`, `storagePath`, `mimeType`, `sizeBytes`, `uploadedById`, `createdAt` |
| `HrPersonnelFileAttachment` | `schema.prisma:~5956` | `hr-personnel-files` | `entryId`, `tenantId`, `filename`, `storagePath`, `mimeType`, `sizeBytes`, `createdById`, `createdAt` |
| `WhArticleImage` | `schema.prisma:~5419` | `wh-article-images` | `articleId`, `tenantId`, `filename`, `storagePath`, `thumbnailPath`, `mimeType`, `sizeBytes`, `sortOrder`, `isPrimary`, `createdById`, `createdAt` |

Nur `WhArticleImage` hat `thumbnailPath` + `sortOrder` + `isPrimary`.

**Andere Speicherformen**:
- `InboundInvoice`, `BankStatement` speichern `storagePath` direkt auf dem Parent-Record (kein separates Attachment-Modell)
- `ServiceSchedule.attachmentFileId` ist eine bare UUID-Spalte ohne Prisma-Relation (`schema.prisma:~6640`)
- `CrmTask.attachments` ist eine JSONB-Spalte (`schema.prisma:823`) — keine relationale Tabelle
- `EmailDefaultAttachment` (`schema.prisma:~6087`) — für default-Attachments auf outgoing Emails (AGB-PDF etc.)

#### 2.2 Supabase-Storage-Buckets

**Config**: `supabase/config.toml:53-101` (Dev). Buckets werden via SQL-Migrations für Hosted-Environments dupliziert.

| Bucket | Public | Size-Limit | MIME-Types | Migration |
|---|---|---|---|---|
| `documents` | false | 10 MiB | PDF, XML | `20260424000001_backfill_missing_storage_buckets.sql:22` |
| `tenant-logos` | **true** | 2 MiB | PNG, JPEG, SVG, WebP | gleiche Migration, Z. 33 |
| `avatars` | **true** | 2 MiB | JPEG, PNG, WebP | gleiche Migration, Z. 44 |
| `wh-article-images` | false | 5 MiB | JPEG, PNG, WebP | gleiche Migration, Z. 55 |
| `crm-attachments` | false | 10 MiB | PDF, JPEG, PNG, WebP, DOCX, XLSX | gleiche Migration, Z. 66 |
| `hr-personnel-files` | false | 20 MiB | PDF, JPEG, PNG, WebP, DOCX, XLSX | gleiche Migration, Z. 84 |
| `inbound-invoices` | false | 20 MiB | PDF, XML, JPEG, PNG | `20260424000000_create_inbound_invoices_storage_bucket.sql:18` |
| `payment-runs` | false | 1 MiB | XML | `20260423000002_..sql:11` |
| `bank-statements` | false | 5 MiB | XML | `20260428000001_..sql:11` |
| `serviceobject-attachments` | false | 10 MiB | PDF, JPEG, PNG, WebP, DOCX, XLSX | `20260504000005_..sql:5` |

**Keine RLS-Policies auf `storage.objects`** in irgendeiner Migration.
Null Matches für `storage.objects` über alle SQL-Migrations. Access
Control läuft **ausschließlich** auf App-Layer via
Service-Role-Key-Client.

**Shared Storage Helper** — `src/lib/supabase/storage.ts`:
- `createSignedUploadUrl(bucket, path)` (`:35`)
- `createSignedReadUrl(bucket, path, expirySeconds)` (`:55`) — default 3600s
- `download(bucket, path)` (`:75`) — returns `Blob | null`
- `upload(bucket, path, body, options?)` (`:85`) — direkter Server-Upload
- `remove(bucket, paths[])` (`:106`) — best-effort
- `removeBatched(bucket, paths[], batchSize=1000)` (`:115`) — DSGVO-Bulk
- `fixSignedUrl(signedUrl)` (`:16`) — ersetzt internen Docker-Hostname mit Public-URL wenn `SUPABASE_URL` != `NEXT_PUBLIC_SUPABASE_URL`
- `getPublicUrl(bucket, path)` (`:28`) — nur für `tenant-logos` / `avatars`

Admin-Client instantiiert in `src/lib/supabase/admin.ts` mit
`SUPABASE_SERVICE_ROLE_KEY`.

#### 2.3 Client-Side Upload Pipeline

**3-Step-Pattern** (alle Haupt-Attachment-Services gleich):
1. Client → tRPC `getUploadUrl` → Server → `storage.createSignedUploadUrl` → zurück `{ signedUrl, storagePath, token }`
2. Client `fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } })` direkt an Supabase — tRPC-Server NICHT im Request-Path
3. Client → tRPC `confirmUpload` mit `{ storagePath, filename, mimeType, sizeBytes }` → Server re-validiert MIME+Size, checkt Storage-Pfad-Prefix, schreibt DB-Row

**Alternativer Pfad** — InboundInvoice (`src/trpc/routers/invoices/inbound.ts:41-43`): Client liest Datei, base64-kodiert, sendet als `fileBase64` im tRPC-Body. Router dekodiert zu Buffer, ruft `storage.upload()` direkt.

**Keine Client-Side Image-Komprimierung** — keine `browser-image-compression` Dependency, keine Compress/Resize-Logik in `.tsx`-Files. `sharp` v0.34.5 (`package.json:114`) ist **Server-only** und nur in `wh-article-image-service.ts:237-258` aktiv, um nach dem Upload 200x200 WebP-Thumbnails zu generieren.

**MIME-Validation Client + Server**:
- Client: lokales `ALLOWED_TYPES` (z.B. `correspondence-attachment-upload.tsx:80-85`)
- Server: re-validiert in `confirmUpload` + `getUploadUrl`
- Server prüft `storagePath`-Prefix gegen Path-Traversal (`service-object-attachment-service.ts:172-177`)

**Kein Virus-Scan** irgendwo im Codebase.

**Storage-Path-Schema**: `{tenantId}/{parentEntityId}/{uuid}.{ext}` — HR hat Extra-Level `{tenantId}/{employeeId}/{entryId}/{uuid}.{ext}` (`hr-personnel-file-attachment-service.ts:188`). Implizite Tenant-Isolation ohne RLS.

#### 2.4 UI-Components für Attachments

**Keine zentrale wiederverwendbare Komponente**. Jedes Modul hat eigene Implementierung.

| Component | Datei | Features |
|---|---|---|
| `CorrespondenceAttachmentUpload` | `src/components/crm/correspondence-attachment-upload.tsx` | Multi-File, Drag&Drop, Status-Tracking, max 5 Files, 10 MB |
| `CorrespondenceAttachmentList` | `src/components/crm/correspondence-attachment-list.tsx` | Liste, Download-Link, Delete-Confirm |
| `AttachmentList` (ServiceObjects) | `src/components/serviceobjects/attachment-list.tsx` | Kombiniert Upload+Liste in einer Komponente, Single-File, hardcoded Deutsch |
| `ArticleImageUpload` | `src/components/warehouse/article-image-upload.tsx` | Multi-File, Drag&Drop, nur Bilder, `URL.createObjectURL` Previews |
| `AvatarUploadDialog` | `src/components/profile/avatar-upload-dialog.tsx` | Single-File, Bild-only, 2 MB, inkl. Delete |
| `InboundInvoiceUploadDialog` | `src/components/invoices/inbound-invoice-upload-dialog.tsx` | PDF-only, 20 MB, base64-Upload-Path |
| HR-Personnel inline | `src/components/hr/personnel-file-entry-dialog.tsx:~86` | kein dedizierter Component |

---

### Block 3 — PDF-Generierung (bestehende Pipeline)

#### 3.1 Library + Pattern

**Libraries** (`package.json:71,104`):
- `@react-pdf/renderer` v4.3.2 — primäre Library für alle Dokument-PDFs
- `pdf-lib` v1.17.1 — in Dependencies, aber **nicht direkt verwendet**. ZUGFeRD/XRechnung-Embedding geht via `@e-invoice-eu/core`.

**Universal-Pattern** über alle PDF-Services:
1. Daten aus Prisma laden
2. `BillingTenantConfig` via `billingTenantConfigRepo.findByTenantId()` laden
3. `React.createElement(TemplatePdf, props)` — **kein JSX am Call-Site**, plain `createElement`
4. `await renderToBuffer(element as any)` → `Buffer`
5. `storage.upload(BUCKET, storagePath, Buffer.from(buffer), { upsert: true })`
6. `storage.createSignedReadUrl(BUCKET, storagePath, expirySeconds)` → `{ signedUrl, filename }`

**Beispiel 1 — BillingDocument PDF** (`src/lib/services/billing-document-pdf-service.ts`):

```ts
// :29
export async function generateAndStorePdf(
  prisma, tenantId, documentId, userId?
): Promise<string>

// :119
export async function getSignedDownloadUrl(...):
  Promise<{ signedUrl, filename } | null>

// :140
export async function generateAndGetDownloadUrl(...):
  Promise<{ signedUrl, filename }>
```

Template: `src/lib/pdf/billing-document-pdf.tsx:98` → `BillingDocumentPdf`. Handelt 7 Dokumenttypen (`:36-44`): OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, INVOICE, CREDIT_NOTE.

**Aufruf**: `billing-document-service.ts:582-590` — PDF-Generierung **außerhalb** der DB-Transaction, best-effort (PDF-Failure blockiert Finalize nicht):
```ts
try {
  await pdfService.generateAndStorePdf(prisma, tenantId, id, audit?.userId)
} catch (err) {
  console.error(`PDF generation failed for document ${id}`, err)
}
```

**Beispiel 2 — Reminder/Mahnung PDF** (`src/lib/services/reminder-pdf-service.ts`):

- `generateAndStorePdf(prisma, tenantId, reminderId)` (`:27`)
- `getSignedDownloadUrl(...)` (`:96`)
- `getSignedDownloadUrlForPath(path, reminderNumber)` (`:116`) — für Preview

Storage-Path: `reminders/${tenantId}/${reminderId}.pdf` (`:19`). Template: `src/lib/pdf/reminder-pdf.tsx:137` → `ReminderPdf`, rendert Stufen 1-4.

**Beispiel 3 — PurchaseOrder PDF** (`src/lib/services/wh-purchase-order-pdf-service.ts`):

- `generateAndGetDownloadUrl(prisma, tenantId, purchaseOrderId)` (`:26`)
- Generiert fresh bei jedem Call, setzt `printedAt`, returned signierte URL (300s)
- **Inkl. Signatur-Block**: Das Template `src/lib/pdf/purchase-order-pdf.tsx:99` hat einen absoluten Ort/Datum + Unterschriftsblock über dem Footer

Storage-Path: `bestellung/${sanitized}.pdf` — inline Sanitizing (`:101-105`), kein `tenantId` im Pfad.

**Weitere PDF-Services**:

| Service | Template | Path-Pattern |
|---|---|---|
| `wh-stocktake-pdf-service.ts:24` | `stocktake-protocol-pdf.tsx` | `inventur/${sanitized}.pdf` |
| `outgoing-invoice-book-pdf-service.ts:46` | `outgoing-invoice-book-pdf.tsx` | `rechnungsausgangsbuch/${tenantId}/${from}_bis_${to}.pdf` |
| `billing-document-einvoice-service.ts:374` | — (kein React-Template, nutzt `@e-invoice-eu/core`) | Billing-Path, überschreibt `.pdf` mit PDF/A-3 |

**PDF-Templates ohne Service-File** (andere Kontexte):
- `src/lib/pdf/audit-log-export-pdf.tsx`
- `src/lib/pdf/datev-steuerberater-anleitung-pdf.tsx`
- `src/lib/pdf/qr-label-pdf.tsx` (Avery L4736 / L4731)

#### 3.2 PDF-Speicherung

**Bucket**: alle PDF-Services nutzen den gleichen Bucket `"documents"` (hartkodierte Constants):
- `billing-document-pdf-service.ts:21`
- `reminder-pdf-service.ts:15`
- `wh-purchase-order-pdf-service.ts:19`
- `wh-stocktake-pdf-service.ts:18`
- `outgoing-invoice-book-pdf-service.ts:19`

**Storage-Path-Konventionen** (relativ innerhalb `documents`):

| Doc-Typ | Pfad-Pattern | Definiert in |
|---|---|---|
| BillingDocument | `{type_de}/{sanitized_number_company}.pdf` | `pdf-storage.ts:27-36` via `getStoragePath()` |
| XRechnung XML | `{type_de}/{sanitized_number_company}.xml` | `pdf-storage.ts:38-47` via `getXmlStoragePath()` |
| Reminder | `reminders/{tenantId}/{reminderId}.pdf` | `reminder-pdf-service.ts:18-20` |
| Purchase Order | `bestellung/{sanitized_number_company}.pdf` | `wh-purchase-order-pdf-service.ts:100-106` |
| Stocktake | `inventur/{sanitized_number}.pdf` | `wh-stocktake-pdf-service.ts:104-122` |
| Outgoing Invoice Book | `rechnungsausgangsbuch/{tenantId}/{from}_bis_{to}.pdf` | `outgoing-invoice-book-pdf-service.ts:68-71` |

`type_de` mapt auf: `angebot, auftragsbestaetigung, lieferschein, serviceschein, ruecklieferschein, rechnung, gutschrift` (`pdf-storage.ts:3-11`).

**Besonderheit**: BillingDocument-Pfade enthalten **NICHT** `tenantId`, nur Nummer+Firma. Reminder-/Outgoing-Invoice-Book-Pfade schon.

**`pdfUrl`-Spalte** auf `BillingDocument` speichert den Storage-Pfad (nicht die volle URL). `reminder.pdfStoragePath` analog.

**Client-Serving**: Signed-URLs (Bucket ist privat). Default-Expiry 3600s (`storage.ts:11`), aber Services überschreiben:
- Billing: 60s (`billing-document-pdf-service.ts:22`)
- Reminder: 60s
- Purchase Order: 300s
- Stocktake: 300s
- Outgoing Invoice Book: 60s

#### 3.3 Templating-Patterns

**Shared Sub-Components** in `src/lib/pdf/`:

- `FusszeilePdf` (`fusszeile-pdf.tsx:36`) — genutzt von **jedem** kommerziellen Dokument. Absolute-positionierter 3-Spalten-Footer bei `bottom: 10mm`:
  - Spalte 1: `companyName`, Adresse, Tel, Email
  - Spalte 2: `bankName`, IBAN, BIC
  - Spalte 3: `taxId` (USt-IdNr.), `commercialRegister`, `managingDirector`
- `PositionTablePdf` (`position-table-pdf.tsx:66`) — BillingDocument-Positionen. 4 Typen: regular, TEXT (grau), SUBTOTAL (bold), PAGE_BREAK (übersprungen).
- `TotalsSummaryPdf` (`totals-summary-pdf.tsx:35`) — Netto/MwSt/Brutto. Genutzt von BillingDocument + PurchaseOrder.
- `RichTextPdf` (`rich-text-pdf.tsx:83`) — Custom HTML-Parser (kein DOM, pure String-Splitting) für Tiptap-Output (`<p>`, `<strong>`, `<em>`, `<br>`).
- `PurchaseOrderPositionTablePdf` — spezialisiert für PO-Positionen.

**Tenant-Branding-Injection**:

Alle kommerziellen PDFs erhalten `tenantConfig` via
`billingTenantConfigRepo.findByTenantId(prisma, tenantId)`
(`billing-tenant-config-repository.ts:3-9`) — direkter
`prisma.billingTenantConfig.findUnique`.

Verwendete Felder:
- `tenantConfig.logoUrl` — `<Image src={tenantConfig.logoUrl}>` top-right, `maxHeight: 50, maxWidth: 150` (z.B. `billing-document-pdf.tsx:111-113`). URL wird von `@react-pdf/renderer` direkt beim Render abgerufen.
- `tenantConfig.companyName` + `companyAddress` — Sender-Zeile über Empfänger-Block
- `bankName`, `iban`, `bic`, `taxId`, `commercialRegister`, `managingDirector`, `phone`, `email` — an `FusszeilePdf` durchgereicht

`BillingTenantConfig` ist 1:1 per Tenant. **Kein Fallback** wenn es fehlt — Templates rendern ohne Letterhead wenn `null`.

#### 3.4 Performance + sync vs async

**Alle PDF-Generierung ist synchron im HTTP-Request.** Keine Background-Queues, keine Worker, keine dedizierten Async-Jobs. `renderToBuffer()` blockiert den Node.js-Prozess.

**Cron-getriggerte indirekte PDF-Generierung** (2 Jobs):

1. `/api/cron/recurring-invoices/route.ts` (daily 04:00 UTC) — erzeugt nur DRAFT-Invoices, **kein PDF**
2. `/api/cron/platform-subscription-autofinalize/route.ts` (daily 04:15 UTC) — ruft `billingDocService.finalize()` in `subscription-autofinalize-service.ts:154`, was PDF als best-effort-Side-Effect triggert (`billing-document-service.ts:585`)

**Keine Timing-Instrumentation** — kein `performance.now()` oder `Date.now()` um PDF-Gen-Calls. **Keine Performance-Metriken** existieren.

**End-to-End-Pfad (BillingDocument Finalize)**:
1. Client → tRPC `billing.documents.finalize` (`documents.ts:235`)
2. Router → `billingDocService.finalize(prisma, tenantId, id, userId, ...)`
3. `$transaction`: Status → PRINTED, Nummer zuweisen — commit
4. Nach Transaction: `pdfService.generateAndStorePdf()` (best-effort)
5. Render → Upload → `repo.update({ pdfUrl: storagePath })` → Audit-Log
6. Später: Client → `billing.documents.downloadPdf` → `billingPdfService.generateAndGetDownloadUrl()` → signed URL zurück
7. Client Browser fetcht Supabase-URL direkt

---

### Block 4 — Audit-Log und Immutability

#### 4.1 Audit-Log-Infrastruktur

**AuditLog Prisma-Modell** — `prisma/schema.prisma:3655-3680`:
- `id` UUID
- `tenantId` UUID (**keine FK-Constraint** auf DB-Ebene, Kommentar bei `:3652-3653`)
- `userId` UUID nullable, FK `users(id)` ON DELETE SET NULL
- `action` VarChar(20)
- `entityType` VarChar(100)
- `entityId` UUID
- `entityName` Text, nullable
- `changes` JSONB, nullable — `{ fieldName: { old, new } }`
- `metadata` JSONB, nullable
- `ipAddress` Text, nullable
- `userAgent` Text, nullable
- `performedAt` TimestampTZ(6), default `now()`

Table: `audit_logs`. 6 Indexe: `tenantId`, `userId`, `(entityType, entityId)`, `action`, `performedAt`, `(tenantId, performedAt)`.

**PlatformAuditLog Prisma-Modell** — `schema.prisma:1736-1753`:
- `platformUserId` UUID nullable (Operator, kein Tenant-User)
- `targetTenantId` UUID nullable
- `supportSessionId` UUID nullable (Impersonation)
- `action` VarChar(**50**) (breiter als Tenant)
- Kein `entityName`, kein `userId`

Table: `platform_audit_logs`.

**Audit-Log Service** — `src/lib/services/audit-logs-service.ts`:

- `log(prisma, data)` (`:173`): Fire-and-forget Single-Write. Catcht alle Errors intern, logged zu console, wirft nie. Bei aktiver Platform-Impersonation (`getImpersonation()` bei `:177`) wird **Dual-Write** mit Action-Prefix `"impersonation."` nach `platform_audit_logs` gemacht (`:187-205`).
- `logBulk(prisma, data[])` (`:222`): Batch via `createMany`. Gleicher Dual-Write (`:233-249`).
- `computeChanges(before, after, fieldsToTrack?)` (`:109`): Liefert `{ fieldName: { old, new } }` Diff. Normalisiert Date→ISO-String, Decimal→number, undefined→null vor Vergleich. Returns `null` wenn nichts geändert.

**Repository** — `src/lib/services/audit-logs-repository.ts`:
- `create(prisma, data)` (`:98`), `createBulk` (`:118`), `findMany`/`count`/`findById`/`findAllForExport`

`AuditLogCreateInput` Interface bei `:85-96`.

**Platform-Audit-Service** — `src/lib/platform/audit-service.ts:82` — `log(prisma, data)` schreibt direkt nach `platformAuditLog`.

**Wie wird gelogged?** Komplett **Service-Level, explizit, fire-and-forget**. Keine Prisma-Extension, keine Middleware, kein DB-Trigger.

Standard-Pattern:
```ts
await auditLog.log(prisma, {
  tenantId,
  userId: audit.userId,
  action: "...",
  entityType: "...",
  entityId: id,
  entityName: ...,
  changes,
  ipAddress: audit.ipAddress,
  userAgent: audit.userAgent,
}).catch(err => console.error('[AuditLog] Failed:', err))
```

`AuditContext` (`audit-logs-service.ts:23-27`): `{ userId, ipAddress?, userAgent? }`.

**3 Beispiele**:

1. User-Create (`users-service.ts:290`): `action: "create", entityType: "user"`
2. Order-Update mit Diff (`order-service.ts:290-303`): nutzt `computeChanges(existing, data, TRACKED_FIELDS)`
3. Invoice-Finalize (`billing-document-service.ts:637-644`): `action: "finalize"`, außerhalb der `$transaction`

#### 4.2 Immutability-Patterns

**BillingDocument** — Primary-Guard (`billing-document-service.ts:82-88`):
```ts
function assertDraft(status: BillingDocumentStatus) {
  if (status !== "DRAFT") {
    throw new BillingDocumentValidationError(
      "Document can only be modified in DRAFT status"
    )
  }
}
```

Wird vor jeder Mutation aufgerufen (z.B. `:423` update, `:979` position-add).

**Atomic DRAFT-Guard auf Update** (`:427-442`):
Update führt `updateMany` mit `where: { id, tenantId, status: "DRAFT" }` aus. Wenn `count === 0`, re-fetched, um "Status changed" vs "Not found" zu unterscheiden. **Schützt gegen Race-Conditions** wenn zwei Requests gleichzeitig den Pre-Check passieren.

**Finalize-Transition** (`:537-579`): In `$transaction`, re-read, Check `status !== "DRAFT"` → throw `"Only DRAFT documents can be finalized"` (`:544`). Setzt atomar `status = "PRINTED"`. PDF + E-Invoice best-effort außerhalb Transaction.

**Cancel-Guard** (`:790-821`): `updateMany` mit `where: { id, tenantId, status: { not: "CANCELLED", notIn: ["FORWARDED"] } }`. Bei `count === 0` re-fetch und throw `"Document is already cancelled"` (`:811`) oder `"Cannot cancel a fully forwarded document"` (`:815`).

**Payment-Guards** (`billing-payment-service.ts`):
- `:289-293`: "Payments can only be recorded against finalized invoices" — blockt DRAFT/CANCELLED
- `:457-460`: "Payment is already cancelled"

**Bookings — Closed-Month-Guard** (`bookings-service.ts:114-136`):
```ts
async function assertMonthNotClosed(...) {
  const mv = await monthlyValuesRepo.findByEmployeeYearMonth(...)
  if (mv?.isClosed) {
    throw new BookingConflictError(
      `Der Monat ${month}/${year} ist abgeschlossen. Buchungen können nicht mehr verändert werden.`
    )
  }
}
```
Aufgerufen bei Create (`:394`), Update (`:495`), Delete (`:555`).

**Monthly-Values** (`monthly-values-service.ts`):
- `:366-369`: `if (mv.isClosed) throw MonthlyValueValidationError("Month is already closed")`
- `:447-450`: Inverse für Reopen

**Summary**: Alles auf Service-Layer via explizite Throws. **Keine DB-CHECK-Constraints** auf Status-Transitions. **Keine UI-only-Disables als einziger Guard.** BillingDocument-Guard mit atomarer `updateMany`-Concurrency-Härtung. **Keine Prisma-Middleware.**

#### 4.3 Field-Encryption

**Implementation** — `src/lib/services/field-encryption.ts`:
- Algorithmus: AES-256-GCM (`:15`)
- IV: 12 Bytes / 96 Bits (`:16`)
- Auth-Tag: 16 Bytes (`:17`)
- Format: `v{version}:{iv_base64}:{authTag_base64}:{ciphertext_base64}` (`:52`)

**Key-Management**: `FIELD_ENCRYPTION_KEY_V{n}` (Base64-32-Byte-Keys), `FIELD_ENCRYPTION_KEY_CURRENT_VERSION` (welche Version für neue Writes). Unterstützt Key-Rotation — alte Versionen bleiben lesbar.

**Beispiel-Ciphertext-Größe**: Für eine deutsche IBAN (`DE89370400440532013000`, 22 Zeichen) ergeben sich ca. 16 + 24 + 28 Base64-Zeichen + Version-Prefix = **~75-80 Zeichen** Ciphertext.

**`hashField(plaintext)` (`:77`)**: HMAC-SHA256, **nur in Tests verwendet**, nicht in Production.

**Wo verwendet?**

- **Employee** (`employees-service.ts:933,942,951,960`, Decrypt im Router `employees.ts:565,574,584,616`):
  - `taxId`, `socialSecurityNumber`, `iban`, `heirIban`
- **EmployeeGarnishment** (`employee-garnishments-service.ts:43,46,106,108`):
  - `creditorName`, `fileReference`
- **EmployeeSavings** (`employee-savings-service.ts:42,100`):
  - `recipientIban`
- **Payroll-Bulk-Import** (`payroll-bulk-import-service.ts:465,468,470+`): gleiche Employee-Felder beim CSV-Import
- **Export-Context-Builder** (`export-context-builder.ts:21,274`): `safeDecrypt()` für Payroll-Exports

**Decrypt-Pattern im Router** (`src/trpc/routers/employees.ts:452-458`):
```ts
function safeDecrypt(val: string | null | undefined): string | null {
  if (!val) return null
  try {
    return isEncrypted(val) ? decryptField(val) : val
  } catch {
    return "[decryption error]"
  }
}
```

Transparent für Legacy-Plaintext-Werte via `isEncrypted()` Check. Decryption happens **im tRPC-Router-Layer**, nicht im Service.

**Typischer Payload**: Kurze Strings (11-stellige Steuer-ID, 22-stellige IBAN, 11-stellige SSN). Größenordnung: ~11-30 Zeichen Plaintext → ~70-90 Zeichen Ciphertext.

---

### Block 5 — Berechtigungen und Mitarbeiter-Zuweisung

#### 5.1 Permission-Catalog

**Datei**: `src/lib/auth/permission-catalog.ts`

**Order-Permissions** (`:151-165`):
- `orders.manage` (`:151`) — **Single-Permission** für alles (list, create, update, delete, status)
- `order_assignments.manage` (`:153`) — Mitarbeiter auf Order setzen
- `order_bookings.manage` (`:158`) — Zeitbuchungen schreiben
- `order_bookings.view` (`:164`) — Zeitbuchungen lesen

**ServiceObject-Permissions** (`:258-260`):
- `service_objects.view` (`:258`)
- `service_objects.manage` (`:259`)
- `service_objects.delete` (`:260`)

**ServiceSchedule-Permissions** (`:263-266`):
- `service_schedules.view` (`:263`)
- `service_schedules.manage` (`:264`)
- `service_schedules.delete` (`:265`)
- `service_schedules.generate_order` (`:266`)

Permission-IDs sind deterministische UUID-v5 aus dem Key-String (`:28`) mit Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1` (`:12`). Call-Pattern: `permissionIdByKey("orders.manage")`.

**Middleware** — `src/lib/auth/middleware.ts`:

- `requirePermission(...permissionIds)` (`:40-59`): Factory für tRPC-Middleware. Variadic, OR-Logik. Ruft `hasAnyPermission(user, permissionIds)` bei `:50`. Throw `FORBIDDEN`. Admin-Bypass in `hasAnyPermission` (nicht hier).
- `requireSelfOrPermission` (`:73-109`): Self-Edit-Pattern. `opts.input ?? getRawInput()` (`:89-90`).
- `requireEmployeePermission` (`:125-192`): 3-Wege-Gate: Admin-Bypass (`:141`), Self (`:153-158`), Fremde (`:162`), TeamMember-Fallback bei `ownPermission` (`:168-184`).
- `applyDataScope` (`:219-234`): Liest `user.dataScopeType`, `dataScopeTenantIds`, ... schreibt in `ctx.dataScope`. Keine Filterung selbst.

**Orders-Router** (`src/trpc/routers/orders.ts:147,178,205,232,257`): Alle 5 Procedures nutzen `.use(requirePermission(ORDERS_MANAGE))` — **eine Permission für alles**. Keine Status-Transition-spezifische Permission. Kommentar bei `:253`: "OrderAssignments cascade-delete per DB FK".

#### 5.2 Mitarbeiter n:m-Zuweisung

Drei Join-Tabellen existieren:

**A) `OrderAssignment`** — `schema.prisma:2598-2621`:
```
OrderAssignment {
  id, tenantId, orderId, employeeId,
  role  String  @default("worker")  // CHECK 'worker'|'leader'|'sales'
  validFrom  DateTime?
  validTo    DateTime?
  isActive   Boolean  @default(true)
  createdAt, updatedAt
  FK order → Order (Cascade), employee → Employee (Cascade)
  UNIQUE (orderId, employeeId, role)
}
```

Ein Employee kann **mehrere Rollen** auf der gleichen Order haben. Unique-Key inkl. `role`.

**Service**: `src/lib/services/order-assignment-service.ts`
- `create` (`:83`): P2002 → `OrderAssignmentConflictError`
- `update` (`:132`): partial
- `remove` (`:188`): hard delete
- **Kein Bulk/Replace-All** — eins nach dem anderen

**Repo**: `src/lib/services/order-assignment-repository.ts`
- Alle Reads inkludieren `{ order: { id, code, name }, employee: { id, firstName, lastName, personnelNumber } }` via `assignmentInclude` (`:11-21`)

**UI**: `src/components/orders/order-assignment-form-dialog.tsx`
- Single-Employee-Form, `EmployeePicker` (`:144`)
- Role-Select + Date-Range
- Employee disabled bei Edit (`:150`)

**B) `CrmTaskAssignee`** — `schema.prisma:850-867`:
```
CrmTaskAssignee {
  id, taskId,
  employeeId  String?   // nullable — kann stattdessen Team sein
  teamId      String?   // nullable
  readAt      DateTime? // Acknowledgement
  createdAt
  FK task → CrmTask (Cascade), employee? → Employee, team? → Team
  UNIQUE (taskId, employeeId), UNIQUE (taskId, teamId)
}
```

Unterstützt Employee ODER Team.

**Service**: `src/lib/services/crm-task-service.ts`
- `create` (`:89`): `assignees: Array<{ employeeId?, teamId? }>`, validiert >= 1 (`:109`)
- `update` (`:188`): ruft `repo.updateAssignees(prisma, input.id, ...)` (`:240`)

**Repo**: `src/lib/services/crm-task-repository.ts:206-223`
- `updateAssignees`: **wipe+recreate** via `$transaction` (`deleteMany({taskId})` + `createMany`)

**UI**: `src/components/crm/task-assignee-select.tsx`
- Multi-Select Popover, Employees + Teams in separaten Sections
- `value: AssigneeItem[]`, Lazy-Load bei Popover-Open

**C) `ShiftAssignment`** — `schema.prisma:3800-3823`:
```
ShiftAssignment {
  id, tenantId, employeeId, shiftId,
  validFrom  DateTime?
  validTo    DateTime?
  notes      String?
  isActive   Boolean  @default(true)
  createdAt, updatedAt
}
```

**Kein dedizierter Service** für ShiftAssignment. `shift-service.ts:236` zählt nur Usages vor Delete. Keine Router-Datei für `shiftAssignment`.

Der Component `ShiftAssignmentFormDialog` (`src/components/shift-planning/shift-assignment-form-dialog.tsx`) ist **irreführend benannt** — er managed `EmployeeDayPlan`-Records (Day-Level-Slots), nicht `ShiftAssignment` direkt.

**Zusammenfassung**:

| Join-Tabelle | Service | UI | Pattern |
|---|---|---|---|
| `OrderAssignment` | Single-at-a-time | `OrderAssignmentFormDialog` + `EmployeePicker` (single) | Inkrementell |
| `CrmTaskAssignee` | `updateAssignees` | `TaskAssigneeSelect` (multi, Emp+Team) | Wipe+Recreate |
| `ShiftAssignment` | — | — (indirekt) | — |

#### 5.3 Active-User-Tracking auf Writes

**`createdById`**: `createdById String? @map("created_by_id") @db.Uuid` auf **~40 Modellen**:

| Model | Zeile |
|---|---|
| `BillingDocument` | 504 |
| `CrmAddress` | 719 |
| `CrmCorrespondence` | 748 |
| `CrmInquiry` | 784 |
| `CrmTask` | 828 |
| `WhArticle` | 959 |
| `BillingServiceCase` | 1044 |
| `BillingPayment` | 1147 |
| `ReminderTemplate` | 1353 |
| `Reminder` | 1409 |
| `ServiceObject` | 959 |
| `ServiceSchedule` | 1044 |
| `WhStockMovement` | 5399 |
| `WhPurchaseOrder` | 5431 |
| `WhSupplierInvoice` | 5546 |
| `WhStocktake` | 5619 |
| `WhReservation` | 5678 |
| `WhWithdrawal` | 5711 |
| ... ~15 weitere | ... |

**`Order` hat weder `createdById` noch `updatedById`!**

**`updatedById`**: nur auf **`ServiceSchedule`** (`schema.prisma:1045`). Kein anderes Modell hat dieses Feld.

**Keine Prisma-Middleware** in `src/lib/db/prisma.ts:21` — `new PrismaClient({ adapter, log })` ohne `$use` oder `$extends`.

**Keine tRPC-Middleware** setzt `createdById` — `src/trpc/init.ts:78` baut Context auf, schreibt keine Model-Felder.

**Manuelles Setzen — 4 Patterns**:

1. **Via `AuditContext` (häufigster)** — `service-schedule-service.ts:365-366`:
   ```ts
   createdById: audit?.userId ?? null,
   updatedById: audit?.userId ?? null,
   ```
   Router konstruiert inline: `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }` (`serviceSchedules.ts:202-205`).

2. **Als expliziter Parameter** — `crm-task-service.ts:105`, `billing-document-service.ts:235`, etc.: `create(..., createdById: string, audit?)`.

3. **Spread im Router** — `serviceObjects.ts:166`: `{ ...input, createdById: ctx.user!.id }`.

4. **`userId`-Parameter** — `wh-stock-movement-service.ts:192`: `createdById: userId`.

**Summary**: Kein Auto-Fill. Jeder Service setzt manuell. Dominantes Pattern: Extraktion aus `AuditContext.userId` = `ctx.user!.id`. **Order selbst hat keine dieser Felder** — bei WorkReport wäre dieser Aspekt neu.

---

### Block 6 — UI-Patterns für mehrstufige Erfassung

#### 6.1 Multi-Step-Forms / Wizards

**Kein `react-hook-form`** im Codebase. Alle Forms nutzen plain React `useState`.

**Pattern 1 — Discriminated-Union Step** (Login-Flow):

`src/app/platform/login/page.tsx:28-37`:
```ts
type Step =
  | { kind: "password" }
  | { kind: "mfa_enrollment"; ... }
  | { kind: "mfa_enrollment_codes"; ... }
  | { kind: "mfa_verify"; ... }
```

State: `useState<Step>({ kind: "password" })` (`:77`). Jede Mutation `onSuccess` → `setStep({kind: ...})` (`:94-101, :120-123`). JSX (`:462-467`) switched auf `step.kind`, rendert `render*()`-Funktion. **Keine Zwischenspeicherung** — komplett in-memory bis Final-Mutation.

**Pattern 2 — Numerischer Step mit Visible Indicator** (Warehouse-Terminals):

`src/components/warehouse/withdrawal-terminal.tsx:30`:
```ts
type Step = 1 | 2 | 3
```

State in `WithdrawalState`-Interface (`:44`). `STEPS`-Constant-Array (`:54-58`) treibt Indicator-UI. Zeilen `:242-261` rendern Indicator-Bar (Active/Completed/Pending Dots). Conditionals `{state.step === N && (...)}` bei `:285, :415, :549`. Back/Next bei `:404-412, :528-533, :619`. **Keine Zwischenspeicherung** — alles in `WithdrawalState`, submit via `useCreateBatchWhWithdrawal` bei Step 3.

`src/components/warehouse/goods-receipt-terminal.tsx:21` — gleiches Pattern, 4 Steps. Step in `useState`-Objekt (`:41`). Indicator-Loop (`:167-188`).

**Pattern 3 — String-Enum Step im Dialog**:

`src/components/settings/cleanup-dialog.tsx:36`:
```ts
type DialogStep = 'input' | 'preview' | 'confirm' | 'success'
```

`setStep('preview')` bei `:138`, `setStep('success')` bei `:154`. **Preview-Step ist API-Call** (`mutation.mutateAsync({confirm: false})`) — Daten werden server-round-tripped, aber **nicht als Draft persistiert**.

`src/components/dsgvo/retention-preview-dialog.tsx:44` — `useState(1)` numerisch 1-4. Step 4 ist Success-Screen.

**Tabs-basiert** (nicht Wizard, aber Multi-Panel):

`src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx:158` — Radix `<Tabs>` mit 11+ `TabsTrigger` (overview, tariff-assignments, tax-sv, bank, compensation, family, benefits, disability, foreign-assignments, garnishments, special-cases, personnel-file). Jeder `TabsContent` ist ein unabhängiger Form-Component mit eigener Mutation. Permission-Gated (`canViewPayroll`, ...).

**Flat Single-Card mit Sections**:

`src/app/platform/(authed)/tenants/new/page.tsx:256` — Ein `<form onSubmit>` mit mehreren vertikalen `<Card>`-Sektionen. Conditional bei `useTemplate` (`:434, :448-616`). **Section-Reveal, nicht Wizard-Navigation** — alles submit auf einmal.

#### 6.2 Draft-Mechanismen

**Entities mit DRAFT-Status** in `prisma/schema.prisma`:

| Entity | Schema | Enum-Values | Workflow |
|---|---|---|---|
| `BillingDocumentStatus` | `:645-650` | DRAFT, PRINTED, PARTIALLY_FORWARDED, FORWARDED, CANCELLED | `DRAFT → PRINTED → FORWARDED` |
| `WhPurchaseOrderStatus` | `:5499-5504` | DRAFT, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED | `DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED` |
| `WhStocktakeStatus` | `:5827-5831` | DRAFT, IN_PROGRESS, COMPLETED, CANCELLED | `DRAFT → IN_PROGRESS → COMPLETED \| CANCELLED` |
| `Reminder.status` (String) | `:1577` | — | `DRAFT → SENT \| CANCELLED` |
| `InboundInvoice.status` (String) | `:6241` | — | `DRAFT → PENDING_APPROVAL → APPROVED → EXPORTED` |
| `PaymentRun.status` (String) | `:6759` | — | `DRAFT → EXPORTED`, `DRAFT/EXPORTED → CANCELLED` |

**Was DRAFT bedeutet**:

- **BillingDocument DRAFT**: editierbar. Position-Mutations + Update + Delete blockiert durch atomaren DRAFT-Guard (`billing-document-service.ts:80-85`). `finalize()` (`:525`) setzt PRINTED + generiert PDF.
- **WhPurchaseOrder DRAFT**: editierbar. Service-Checks `status !== "DRAFT"` bei `:204-205, :276-277, :309-310, :417-418, :592-593, :672-673`.
- **WhStocktake DRAFT**: aufgesetzt, nicht begonnen. `startCounting()` (`wh-stocktake-service.ts:237`) transitiert zu IN_PROGRESS. Delete nur DRAFT (`:572`).
- **Reminder DRAFT**: erstellt, nicht versendet. `reminder-service.ts:281` (mark-as-sent-manual) + `:341` (send via email) nur DRAFT.
- **InboundInvoice DRAFT**: hochgeladen, nicht submittet. `inbound-invoice-service.ts:132` Create; Update nur DRAFT/REJECTED (`:231-232`); Delete nur DRAFT (`:528`).
- **PaymentRun DRAFT**: zusammengestellt, XML nicht exportiert. `payment-run-service.ts:408` requires DRAFT vor EXPORTED.

**Service-Level Finalize-Pattern** (universell):
1. Entity in `$transaction` laden
2. `status !== "DRAFT"` check, throw wenn nicht
3. Update im Transaction
4. Side-Effects (PDF, Email, XML) nach Commit, außerhalb Transaction

Beispiel `billing-document-service.ts:537-579`.

**UI-Filterung** (Draft-Liste):

- `src/components/billing/document-list.tsx:50,88,139` — `statusFilter`-State `'all'` default, `<Select>` bei `:133` mit DRAFT/PRINTED/FORWARDED/CANCELLED
- `src/components/warehouse/purchase-order-list.tsx:52,59,105` — gleiches Pattern
- `src/components/invoices/inbound-invoice-list.tsx:30-38` — `STATUS_FILTER_KEYS` inkl. `{ value: 'DRAFT', key: 'status.draft' }`

**Kein Autosave, kein localStorage-Draft** für Form-Daten. Nur Server-seitige Drafts (Entity wird mit `status: "DRAFT"` sofort beim ersten Save erzeugt und via List-View + Status-Filter wiedergefunden).

`localStorage` wird nur genutzt für:
- `src/lib/storage.ts:42` — `tenant_id` für Multi-Tenancy-Routing
- `src/lib/storage.ts:101-133` — `terp_platform_impersonation` Support-Session
- `src/providers/theme-provider.tsx` + `src/components/layout/sidebar/sidebar-context.tsx` — UI-Preferences

#### 6.3 Canvas-basierte UI

**HTML5 Canvas**: **Null Direktnutzung**. Keine `getContext("2d")`, kein `<canvas>`-Element, kein `HTMLCanvasElement`-Reference in `src/`.

**Signatur-Libraries in `package.json`**: **Keine**. Weder `react-signature-canvas` noch `signature_pad` noch `react-sketch-canvas` sind Dependencies.

**Drawing / Image-Editing**: **Keine Components**.

**Andere "canvas"-Vorkommen** (alle CSS-Layout oder Library-intern):
- `src/components/billing/document-editor.tsx:588,592` — "A4 Document Canvas" als CSS-Kommentar + `data-testid="document-canvas"` auf `<div>`. CSS-Layout-Metapher, kein HTML5-Canvas.
- `src/components/ui/sidebar.tsx:157,164,222,234` — "offcanvas" als CSS-Collapsible-Sidebar-Modus (Radix-Pattern).

**QR-Code-Gen** (nutzt `qrcode`-npm, nicht Raw-Canvas-API):
- `src/lib/services/qr-utils.ts:9,25` — `QRCode.toDataURL(content, {width, margin})`
- `src/app/platform/login/page.tsx:19,151` — TOTP-QR für MFA, gerendert als `<img src={qrDataUrl}>` (`:273`)

**QR-Scanning**: `html5-qrcode` v2.3.8 (`package.json:91`) in `src/components/warehouse/qr-scanner.tsx:29-31,102` — dynamisch importiert für SSR-Safety. Library nutzt Canvas intern.

**Charts**: `recharts` (`package.json:111`) — nutzt SVG, kein Canvas.

**Summary**: Keine Signatur-/Drawing-/direkte-Canvas-API-Nutzung irgendwo in `src/`. Canvas-adjacent-Features (QR) sind komplett hinter Library-APIs gekapselt. **Eine Canvas-basierte Signatur im M-1 wäre eine neu einzuführende Dependency und neu zu bauender Component** — es gibt keine Infrastruktur, auf die man aufsetzen kann.

---

### Block 7 — i18n und Dokument-Sprache

#### 7.1 PDF-Lokalisierung

**Alle PDFs sind hartkodiert Deutsch.** Kein `locale`-Parameter existiert in der PDF-Layer.

**Evidence — Hartkodierte Label-Maps**:

`src/lib/pdf/billing-document-pdf.tsx:36-44`:
```ts
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  OFFER: "Angebot",
  ORDER_CONFIRMATION: "Auftragsbestätigung",
  DELIVERY_NOTE: "Lieferschein",
  SERVICE_NOTE: "Leistungsschein",
  RETURN_DELIVERY: "Rücklieferschein",
  INVOICE: "Rechnung",
  CREDIT_NOTE: "Gutschrift",
}
```

`src/lib/pdf/reminder-pdf.tsx:75-80`:
```ts
const LEVEL_LABELS: Record<number, string> = {
  1: "Zahlungserinnerung",
  2: "Mahnung — Stufe 2",
  3: "Letzte Mahnung — Stufe 3",
  4: "Mahnung — Stufe 4",
}
```

**Evidence — Hartkodierte Spalten-Header**:
- `position-table-pdf.tsx:71-77` — "Pos", "Beschreibung", "Menge", "Einheit", "Einzelpreis", "Gesamt"
- `reminder-pdf.tsx:182-187` — "Rechnungsnr.", "Datum", "Fällig am", "Offen", "Tage", "Zinsen"
- `outgoing-invoice-book-pdf.tsx:227` — "Rechnungsausgangsbuch"
- `stocktake-protocol-pdf.tsx:135` — "Inventurprotokoll"
- `purchase-order-pdf.tsx:147` — "BESTELLUNG"

**Evidence — Hartkodierte `"de-DE"` in allen Intl-Formatters**:
- `billing-document-pdf.tsx:48` — `new Intl.DateTimeFormat("de-DE")`
- `position-table-pdf.tsx:41-44, :48-51` — `Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })`
- `totals-summary-pdf.tsx:23-26` — gleiche Formatter
- `reminder-pdf.tsx:84` — `Intl.DateTimeFormat("de-DE")`
- `outgoing-invoice-book-pdf.tsx:101-104, :108-110, :113-116` — alle drei
- `audit-log-export-pdf.tsx:64-71, :76` — beide
- `fusszeile-pdf.tsx:44-55` — "Tel: ", "IBAN: ", "BIC: ", "USt-IdNr.: ", "GF: " — alle hartkodierte deutsche Abkürzungen

**Nutzung von `next-intl` in PDFs**: **Null**. Grep über `src/lib/pdf/` für `next-intl` → null Matches. Keine PDF-Component + kein PDF-Service importiert `next-intl`.

**next-intl-Config**:
- `next.config.ts:2-4` — `createNextIntlPlugin('./src/i18n/request.ts')`
- `src/i18n/routing.ts:3-7` — Locales `['de', 'en']`, Default `'de'`, Prefix-Strategy `'as-needed'` (kein `/de/` Prefix für Default)
- `src/i18n/request.ts:1-13` — Server-Side-Config via `getRequestConfig`. Liest `requestLocale`, Fallback `routing.defaultLocale`, dynamischer Import `messages/${locale}.json`
- `src/proxy.ts:7` — `createIntlMiddleware(routing)` für alle Tenant-seitigen Requests. `:26-29` zeigen: `/platform/*` **bypassed das intlMiddleware** komplett mit `NextResponse.next()`

**Adress-/Currency-Formatierung**:
- **Adresse**: Street in einer Zeile, `zip + " " + city` in nächster (`billing-document-pdf.tsx:118-125`, gleicher Pattern in Reminder/Purchase-Order). **Keine locale-spezifische Adress-Format-Logik**.
- **Currency**: immer EUR, mit `"de-DE"` formatiert (Punkt-Tausender, Komma-Dezimal, €-Symbol). **Kein Currency-Feld im Dokument-Datenmodell** — EUR hartkodiert.
- **Datum**: `Intl.DateTimeFormat("de-DE")` → `DD.MM.YYYY`.

#### 7.2 Supported Languages

**Configured Locales**: `src/i18n/routing.ts:4-5` — genau zwei: `'de'` + `'en'`. Default `'de'`.

`messages/de.json` — deutsche Message-Katalog (Production).
`messages/en.json` — englische Message-Katalog (mirrored alle Keys).

**Locale/Language-Feld auf Tenant/User**: **Existiert nicht**. Keine `locale`- oder `language`-Spalte auf `Tenant` (`schema.prisma:100-327`) oder `User` (`schema.prisma:28-88`). Tenant hat `settings Json?` (`:104`) als generische JSONB-Blob — kein typisiertes Locale-Feld.

**Platform-Admin — Deutsch-only, no next-intl**:
- `src/proxy.ts:26-29` — `if (path.startsWith('/platform')) { return NextResponse.next() }` — bypassed `intlMiddleware`
- `src/app/platform/(authed)/dashboard/page.tsx:65-67` — deutsche Strings direkt im JSX (`"Überblick über laufende Support-Sessions und Audit-Ereignisse."`) — kein `useTranslations`-Call
- `src/app/platform/login/page.tsx:43-50` — deutsche Error-Messages in plain Function, kein `next-intl`-Import
- Grep für `useTranslations | getTranslations` über `src/app/platform/` → **null Files**

**next-intl in Tenant-UI**: 250+ Component-Files nutzen es, u.a. Billing-UI (`billing/document-editor.tsx`, `billing/dunning/*`, `billing/outgoing-invoice-book.tsx`).

**Billing-Message-Keys** (in `messages/de.json` + `messages/en.json`):
- `billingDocuments` (line 6637)
  - `"typeServiceNote": "Leistungsschein"` (de) / `"Service Note"` (en) (line 6641)
- `billingDunning` (line 7112)
- `billingRecurring` (line 6945)
- `billingOutgoingInvoiceBook` (line 6803)
- `billingOpenItems` (line 6831)
- `billingPriceLists` (line 6885)
- `billingTemplates` (line 7269)
- `billingServiceCases` (line 7056)

**Kein "Arbeitsschein"-Key existiert** in `messages/de.json` oder `messages/en.json`. Grep → null Matches.

---

## Code References

### Block 1 — Order/ServiceObject

- `prisma/schema.prisma:2548-2587` — Order Prisma-Modell
- `prisma/schema.prisma:2545` — DB CHECK `status IN (...)` Kommentar
- `src/lib/services/order-service.ts:139` — status default `"active"` on create
- `src/lib/services/order-service.ts:239-241` — status generic update
- `src/lib/services/order-service.ts:308-337` — serviceSchedule.recordCompletion Side-Effect
- `src/lib/services/order-service.ts:16-20` — TRACKED_FIELDS (kein `status`)
- `src/trpc/routers/orders.ts:147-168` — list-Procedure mit serviceObjectId-Filter
- `src/lib/services/order-repository.ts:40-66` — findManyByServiceObject
- `src/lib/services/order-booking-aggregator.ts:10-73` — Aggregator-Signaturen + Return-Type
- `src/lib/services/service-object-service.ts:826-913` — getHistoryByServiceObject
- `src/app/[locale]/(dashboard)/admin/orders/page.tsx` — Order-Listseite
- `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` — Order-Detail (4 Tabs)

### Block 2 — File-Upload

- `prisma/schema.prisma:~739` — CrmCorrespondenceAttachment
- `prisma/schema.prisma:~979` — ServiceObjectAttachment
- `prisma/schema.prisma:~5419` — WhArticleImage (mit thumbnail + ordering)
- `prisma/schema.prisma:~5956` — HrPersonnelFileAttachment
- `supabase/config.toml:53-101` — lokale Bucket-Config
- `supabase/migrations/20260424000001_backfill_missing_storage_buckets.sql` — 5 Core-Buckets
- `src/lib/supabase/storage.ts:16-135` — Storage-Helper (Upload/Download/Signed-URL)
- `src/lib/supabase/admin.ts` — Admin-Client mit Service-Role-Key
- `src/lib/services/service-object-attachment-service.ts:112-115,172-177` — MIME + Pfad-Traversal-Validation
- `src/lib/services/wh-article-image-service.ts:237-258` — Sharp Thumbnail-Gen

### Block 3 — PDF

- `package.json:71` — `@react-pdf/renderer` v4.3.2
- `src/lib/services/billing-document-pdf-service.ts:29,119,140` — 3 Export-Signaturen
- `src/lib/pdf/billing-document-pdf.tsx:98` — BillingDocumentPdf-Component
- `src/lib/services/reminder-pdf-service.ts:27,96,116` — Reminder-Service
- `src/lib/pdf/reminder-pdf.tsx:137` — ReminderPdf-Component
- `src/lib/services/wh-purchase-order-pdf-service.ts:26,100-106` — PO-Service + Storage-Path
- `src/lib/pdf/purchase-order-pdf.tsx:99` — PurchaseOrderPdf-Component (mit Signatur-Block!)
- `src/lib/pdf/fusszeile-pdf.tsx:36` — Shared Footer-Component
- `src/lib/pdf/position-table-pdf.tsx:66` — Position-Table
- `src/lib/pdf/totals-summary-pdf.tsx:35` — Totals-Summary
- `src/lib/pdf/rich-text-pdf.tsx:83` — Tiptap-HTML-Parser
- `src/lib/services/pdf-storage.ts:3-11,27-47` — Type-Labels + Path-Helpers
- `src/lib/services/billing-tenant-config-repository.ts:3-9` — findByTenantId
- `src/lib/services/billing-document-service.ts:582-590` — Best-Effort PDF-Gen nach Transaction

### Block 4 — Audit + Immutability

- `prisma/schema.prisma:3655-3680` — AuditLog-Modell
- `prisma/schema.prisma:1736-1753` — PlatformAuditLog-Modell
- `src/lib/services/audit-logs-service.ts:23-27` — AuditContext-Type
- `src/lib/services/audit-logs-service.ts:109` — computeChanges
- `src/lib/services/audit-logs-service.ts:173,187-205` — log + Impersonation-Dual-Write
- `src/lib/services/audit-logs-service.ts:222,233-249` — logBulk
- `src/lib/platform/audit-service.ts:82` — Platform-Log
- `src/lib/services/billing-document-service.ts:82-88` — assertDraft Guard
- `src/lib/services/billing-document-service.ts:427-442` — atomarer DRAFT-updateMany
- `src/lib/services/billing-document-service.ts:537-579` — finalize-Transaction
- `src/lib/services/billing-document-service.ts:790-821` — cancel-Guard
- `src/lib/services/billing-payment-service.ts:289-293` — Payment-Gate
- `src/lib/services/field-encryption.ts:46-80` — encrypt/decrypt/isEncrypted/hashField
- `src/lib/services/employees-service.ts:931-960` — encryptField-Aufrufe
- `src/trpc/routers/employees.ts:452-458` — safeDecrypt-Helper

### Block 5 — Permissions + Assignments

- `src/lib/auth/permission-catalog.ts:151-165,258-266` — Order/ServiceObject/ServiceSchedule Permissions
- `src/lib/auth/middleware.ts:40-59` — requirePermission Factory
- `src/lib/auth/middleware.ts:73-109` — requireSelfOrPermission
- `src/lib/auth/middleware.ts:125-192` — requireEmployeePermission
- `src/lib/auth/middleware.ts:219-234` — applyDataScope
- `src/trpc/routers/orders.ts:148,178,205,232,257` — alle mit ORDERS_MANAGE
- `prisma/schema.prisma:2598-2621` — OrderAssignment
- `prisma/schema.prisma:850-867` — CrmTaskAssignee
- `prisma/schema.prisma:3800-3823` — ShiftAssignment
- `src/lib/services/order-assignment-service.ts:83,132,188` — CRUD
- `src/lib/services/order-assignment-repository.ts:11-21` — assignmentInclude
- `src/components/orders/order-assignment-form-dialog.tsx:144,150` — EmployeePicker
- `src/components/crm/task-assignee-select.tsx:57,77` — Multi-Select
- `src/lib/services/crm-task-repository.ts:206-223` — updateAssignees wipe+recreate
- `src/lib/services/service-schedule-service.ts:365-366,514` — createdById/updatedById
- `src/trpc/routers/serviceObjects.ts:166` — `{ ...input, createdById: ctx.user!.id }`
- `src/lib/db/prisma.ts:21` — PrismaClient ohne Middleware
- `src/trpc/init.ts:78` — tRPC-Context

### Block 6 — UI-Patterns

- `src/app/platform/login/page.tsx:28-37,77,94-101,120-123,462-467` — Discriminated-Union-Wizard
- `src/components/warehouse/withdrawal-terminal.tsx:30,44,54-58,115,242-261,285,415,549,404-412` — Numerischer Step
- `src/components/warehouse/goods-receipt-terminal.tsx:21,41,78,87,144,167-188` — 4-Step-Terminal
- `src/components/settings/cleanup-dialog.tsx:36,59,138,154` — String-Enum-Dialog
- `src/components/dsgvo/retention-preview-dialog.tsx:44,74,193,217` — Numerisch 1-4
- `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx:158,161-172` — Tabs-basiert
- `src/app/platform/(authed)/tenants/new/page.tsx:256,191,210,434,448-616` — Section-Reveal
- `prisma/schema.prisma:645-650,5499-5504,5827-5831,1577,6241,6759` — DRAFT-Statuses
- `src/lib/storage.ts:42,101-133` — localStorage-Usages (nicht Form-Draft)
- `src/components/billing/document-editor.tsx:588,592` — "A4 Canvas" (CSS-Metapher)
- `src/lib/services/qr-utils.ts:9,25` — `qrcode` Library
- `src/components/warehouse/qr-scanner.tsx:29-31,102` — `html5-qrcode`

### Block 7 — i18n

- `next.config.ts:2-4` — createNextIntlPlugin
- `src/i18n/routing.ts:3-7` — Locales `['de', 'en']`, Default `'de'`
- `src/i18n/request.ts:1-13` — Server-Side-Config
- `src/proxy.ts:7,26-29` — intlMiddleware + Platform-Bypass
- `src/lib/pdf/billing-document-pdf.tsx:36-44,48,111-113,118-125` — hartkodierte Labels + `de-DE`
- `src/lib/pdf/reminder-pdf.tsx:75-80,84,156-164,182-187` — hartkodierte Labels
- `src/lib/pdf/position-table-pdf.tsx:41-44,48-51,71-77` — Currency/Number/Columns
- `src/lib/pdf/totals-summary-pdf.tsx:23-26` — Currency
- `src/lib/pdf/fusszeile-pdf.tsx:44-55` — hartkodierte Abkürzungen
- `messages/de.json:6637-7269` — Billing-Namespaces
- `messages/de.json:6641` — `"typeServiceNote": "Leistungsschein"`

---

## Architecture Documentation

**Service + Repository Pattern**: Router (thin) → Service (Business-Logic) → Repository (Prisma). `handleServiceError` mapt Domain-Errors (`NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`) auf `TRPCError`-Codes.

**tRPC-Context-Build**: `src/trpc/init.ts` extrahiert User aus Supabase-Session, lädt `user.userTenants` in-memory. `tenantProcedure` scannt in-memory, throw FORBIDDEN.

**Middleware-Stack**: `tenantProcedure.use(requirePermission(PERMISSION_ID))` — konsistent über alle Router. Permissions als deterministische UUID-v5 aus Key-String.

**Audit-Split (Tenant vs Platform)**: `audit_logs` (Tenant-Actions) vs `platform_audit_logs` (Platform-Admin-Actions). Impersonation triggert Dual-Write via `getImpersonation()` im `auditLog.log()`.

**Service-Object-Modell (T-1)**: Baum-Struktur (`parent`/`children`), Pflicht-FK auf `CrmAddress` (`customerAddressId`), 5-Wert-Status-Enum, QR-Code-Payload-Spalte.

**Booking-Aggregation (T-2)**: `order-booking-aggregator.ts` mit zwei Groupby-Queries. History-View in ServiceObject zieht Orders + Booking-Summary via `findManyByServiceObject` + `getBookingSummariesByOrders`.

**Wartungsintervalle (T-3)**: `ServiceSchedule`-Modell, `Order.serviceScheduleId`-FK. `serviceScheduleService.recordCompletion()` bei Order-`→ completed` Side-Effect. Einziges Modell mit `updatedById`.

**DRAFT-Finalize-Pattern**: Service-Layer-Guards mit atomarer `updateMany`-Status-Condition gegen Race-Conditions. Side-Effects (PDF, Email, XML) best-effort nach Transaction-Commit.

**PDF-Pipeline**: `@react-pdf/renderer` → `renderToBuffer()` → Supabase-Storage Bucket `documents`. Synchron im Request. Shared Sub-Components (`FusszeilePdf`, `PositionTablePdf`, `TotalsSummaryPdf`). Tenant-Branding via `BillingTenantConfig`. **Komplett Deutsch hartkodiert.**

**Permission-Catalog**: Deterministische UUID-v5 aus Key-String. Granularität variiert (Order = 1 Permission für alles, ServiceObject = view/manage/delete, ServiceSchedule = view/manage/delete/generate_order).

**N:m-Assignment-Patterns**: drei existieren, alle unterschiedlich — OrderAssignment (inkrementell, mit Rollen), CrmTaskAssignee (wipe+recreate, Employee+Team), ShiftAssignment (kein Service).

---

## Historical Context (from thoughts/)

**Direkt relevant — T-1/T-2/T-3 Vorgänger**:
- `thoughts/shared/research/2026-04-20-serviceobjekte-codebase-analyse.md` — T-1 Codebase-Analyse (Baseline für ServiceObject)
- `thoughts/shared/plans/2026-04-21-serviceobjekte-stammdaten.md` — T-1 Implementation-Plan
- `thoughts/shared/research/2026-04-21-serviceobjekte-historie-codebase-analyse.md` — T-2 (Einsatz-Historie)
- `thoughts/shared/plans/2026-04-21-serviceobjekte-historie.md` — T-2 Plan
- `thoughts/shared/research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md` — T-3 (Wartungsintervalle)
- `thoughts/shared/plans/2026-04-22-serviceobjekte-wartungsintervalle.md` — T-3 Plan

**Nahe Analoga — Field-Service-Dokumente mit Unterschrift**:
- `thoughts/shared/tickets/ZMI-TICKET-154-digitale-unterschriften.md` — **direktester Bezugspunkt** für Kundensignatur
- `thoughts/shared/tickets/ZMI-TICKET-153-abnahmeprotokoll.md` — Abnahmeprotokoll mit Kunden-Sign-off
- `thoughts/shared/tickets/ZMI-TICKET-152-regiebericht.md` — Regiebericht = Tägliche Feldarbeit
- `thoughts/shared/tickets/ZMI-TICKET-151-bautagesbericht.md` — Bautagesbericht
- `thoughts/shared/tickets/ZMI-TICKET-155-berichtsvorlagen.md` — Report-Templates-System

**Order-Lifecycle / Kundendienst**:
- `thoughts/shared/research/2026-03-17-ORD_01-belegkette.md` — Belegkette (Angebot→AB→LS→Rechnung)
- `thoughts/shared/plans/2026-03-17-ORD_01-belegkette.md` — Plan
- `thoughts/shared/research/2026-03-17-ORD_02-kundendienst-service-cases.md` — **Kundendienst/Field-Service-Orders**
- `thoughts/shared/plans/2026-03-17-ORD_02-kundendienst-service-cases.md` — Plan
- `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_02_KUNDENDIENST.md` — Ticket-Spec

**PDF-Generierung**:
- `thoughts/shared/tickets/ZMI-TICKET-140-pdf-generierung.md` — PDF-Gen-Ticket
- `thoughts/shared/research/2026-03-19-billing-vorgang.md` — Billing-Lifecycle inkl. PDF
- `thoughts/shared/research/2026-03-25-EK_01-bestelldruck-pdf.md` — Bestelldruck-Pattern (hat schon Unterschriftsblock!)
- `thoughts/shared/plans/2026-03-25-EK_01-bestelldruck-pdf.md` — Plan

**Mobile-UX (Vorbereitung M-2)**:
- `thoughts/shared/tickets/orgAuftrag/MOBILE_00_TICKET_INDEX.md` — Master-Index
- `thoughts/shared/tickets/orgAuftrag/MOBILE_03_FORM_DIALOG_PATTERN.md` — Form-/Dialog-Pattern
- `thoughts/shared/research/2026-03-26-WH_12-mobile-qr-scanner.md` — QR-Scanner (Kamera-Access)

**File-Upload-Infrastruktur**:
- `thoughts/shared/research/2026-03-25-WH_13-artikelbilder.md` — Artikelbilder (Supabase-Bucket-Setup)
- `thoughts/shared/plans/2026-03-25-WH_13-artikelbilder.md` — Plan
- `thoughts/shared/research/2026-03-26-CRM_07-korrespondenz-anhaenge.md` — Korrespondenz-Anhänge
- `thoughts/shared/tickets/ZMI-TICKET-111-projektmappe-dateiablage-storage.md` — Projektmappe-Storage
- `thoughts/shared/audit/bugs/AUDIT-010-upload-size-limits.md` — Upload-Size-Limits

**Audit-Log**:
- `thoughts/shared/research/2026-03-20-audit-logging-setup-analysis.md` — Setup-Analyse
- `thoughts/shared/plans/2026-03-20-audit-logging-implementation.md` — Plan
- `thoughts/shared/research/2026-04-07-audit-protocol-coverage.md` — Coverage-Gaps

**Status / Context**:
- `thoughts/shared/research/2026-04-22-prelaunch-status-audit.md` — aktueller Prelaunch-Status

## Related Research

- `thoughts/shared/research/2026-04-20-serviceobjekte-codebase-analyse.md` (T-1)
- `thoughts/shared/research/2026-04-21-serviceobjekte-historie-codebase-analyse.md` (T-2)
- `thoughts/shared/research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md` (T-3)

---

## Fragen, die Business-Entscheidungen brauchen

Diese Fragen ergeben sich aus dem Code-Stand, lassen sich aber nicht
vom Codebase beantworten — sie benötigen Stakeholder-Input:

1. **Permission-Granularität für WorkReport**: Soll `work_reports.*`
   dem Order-Pattern (Single-Permission `manage`) folgen oder dem
   ServiceObject/ServiceSchedule-Pattern (`view` + `manage` +
   `delete` ggf. + `sign`)? Besonders bei SIGNED→VOID wäre eine
   separate `work_reports.void` Permission sinnvoll, da nicht jeder
   Bürobenutzer einen unterschriebenen Arbeitsschein stornieren
   dürfen sollte.

2. **N:m-Assignment-Pattern-Wahl**: OrderAssignment-Style (Rollen +
   Zeitfenster + `UNIQUE (parentId, employeeId, role)` + inkrementell)
   oder CrmTaskAssignee-Style (wipe+recreate bei Update)? Für einen
   Arbeitsschein mit 2-3 Technikern pro Einsatz und seltenem Edit
   könnte CrmTaskAssignee simpler sein — aber OrderAssignment ist
   strukturell näher am Einsatz-Kontext.

3. **Signatur-Storage**: Base64-PNG in DB-Spalte vs Supabase-Storage-
   Datei? Field-Encryption ist heute auf Short-Strings (~30 Zeichen)
   ausgelegt — eine komplette Signatur-PNG (typisch 5-50 KB) als
   `encryptField()`-Payload würde funktionieren, aber nicht mehr im
   erwarteten Rahmen liegen. Alternative: PNG in eigenem Bucket
   `workreport-signatures` (privat), `storagePath` + Metadaten
   (`signerName`, `signerRole`, `signedAt`, `ipAddressHash`) in DB.

4. **IP-Hashing-Strategie**: `hashField(plaintext)` existiert
   (`field-encryption.ts:77`), ist aber nur in Tests verwendet.
   Soll WorkReport diese Funktion aktivieren (HMAC-SHA256) und
   `signerIpHash` als gehashte Spalte speichern, oder eine eigene
   Hashing-Strategie nutzen?

5. **Status-Representation**: DRAFT/SIGNED/VOID als Prisma-Enum
   (wie `BillingDocumentStatus`) oder String mit DB-CHECK (wie
   `Order.status`)? Das Codebase zeigt beide Patterns. BillingDocument-
   Enum-Pattern wäre konsistenter mit dem Immutability-Pattern.

6. **Unveränderlichkeit nach SIGNED**: Atomic-`updateMany`-Status-
   Condition (`billing-document-service.ts:427-442` Pattern) oder
   einfache `assertDraft()`-Style Throws? Bei Signatur-Collision
   (2 parallele Signatur-Requests) ist atomare Concurrency-Härtung
   sinnvoll — aber der Use-Case ist selten. Design-Entscheidung.

7. **PDF-Trigger-Zeitpunkt**: Fresh bei jedem Download (wie
   PurchaseOrder) oder on-Signing persistiert (wie BillingDocument
   `pdfUrl`-Spalte)? Nach Signatur sollte das PDF unveränderlich
   archiviert sein (rechtliche Anforderung), aber vor Signatur ist
   on-Demand-Rendering sinnvoll.

8. **Storage-Path-Konvention**: Mit oder ohne `tenantId` im Pfad?
   BillingDocuments haben keinen `tenantId` im Pfad (Namens-
   Konvention: `rechnung/{sanitized_number_company}.pdf`), aber
   Reminder und OutgoingInvoiceBook haben einen (`reminders/{tenantId}/
   {reminderId}.pdf`). Für Multi-Tenant-Isolation wäre Pfad-
   Inklusion sicherer.

9. **Sprach-Unterstützung für Arbeitsschein-PDF**: Deutsch-only
   (wie alle existierenden PDFs) oder auch Englisch für
   internationale Kunden? Aktueller Codebase hat **keine Infrastruktur
   für lokalisierte PDFs** — der Aufwand für bilinguales Arbeitsschein-
   PDF wäre signifikant (alle Labels extrahieren + next-intl in PDF-
   Services importieren + Test-Flow pro Locale). Business-Frage:
   realer Bedarf heute?

10. **Foto-Attachment-Integration**: Eigene `WorkReportAttachment`-
    Entität (wie ServiceObjectAttachment) oder Reuse der existierenden
    `ServiceObjectAttachment`-Relation mit zusätzlicher FK auf
    WorkReport? Letzteres spart DB-Modell, koppelt aber zwei Domains.

11. **StockWithdrawal-Referenz**: Wie genau soll Material-Entnahme
    einem WorkReport zugeordnet werden? Aktuelles Modell `WhWithdrawal`
    (schema.prisma:5711) hat `createdById` aber vermutlich keinen
    `workReportId`-FK. Neuer FK-Column auf `WhWithdrawal` oder Join-
    Tabelle? Das Ticket formuliert vage "können auf WorkReport
    verweisen ZUSÄTZLICH zu Order" — d.h. WhWithdrawal würde
    künftig OPTIONAL auf WorkReport referenzieren können.

12. **`createdById`/`updatedById`-Design**: Order hat heute keine
    dieser Felder, obwohl ~40 andere Modelle `createdById` haben.
    WorkReport sollte vermutlich `createdById` + `signedById` haben
    — und falls VOID via dedicated Transition läuft, ggf.
    `voidedById` + `voidedAt` + `voidReason`.
