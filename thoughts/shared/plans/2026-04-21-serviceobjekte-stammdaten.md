---
date: 2026-04-21
planner: impactj90
branch: staging
repository: terp
topic: "Serviceobjekte — Stammdaten, Hierarchie, Anhänge, QR-Code"
tags: [plan, serviceobjekte, prisma, trpc, attachments, qr-code, csv-import, crm]
status: ready
research: thoughts/shared/research/2026-04-20-serviceobjekte-codebase-analyse.md
---

# Serviceobjekte — Stammdaten, Hierarchie, Anhänge, QR-Code

## Overview

Einführung einer Top-Level-Entität `ServiceObject` als Stammdaten-Anker
für die Kunden-Objekte, die ein mobiler Service-Dienstleister betreut
(industrielle Wartung, Gebäudereinigung, DGUV-V3, Aufzug, Brandschutz,
TGA/Kälte-Klima, Tor-Service, Schädlingsbekämpfung, Sicherheitstechnik,
Medizintechnik, Grünpflege).

Das Modell ist vokabel-neutral; branchenspezifische Profile folgen in
einem separaten Ticket. Die Entität bekommt eine Adjacency-List-
Hierarchie, eine Pflicht-Verknüpfung zum Kunden (`CrmAddress`), eigene
Dateianhänge, einen QR-Code für Feldidentifikation, eine optionale
Verknüpfung mit `Order`, einen parallelen Referenzpfad im Warehouse-
Withdrawal-Flow (koexistent mit der bestehenden `machineId`-Freitext-
Spalte) sowie einen CSV-Import mit Zwei-Phasen-Validierung.

## Current State Analysis

Das aktuelle System enthält **genau eine** persistierte Objekt-Referenz:
`WhStockMovement.machineId` (`prisma/schema.prisma:5395`) — ein nullable
`TEXT`-Feld ohne FK, ohne Entitätsbindung. Alle anderen Objekt-/Maschine-/
Gerät-Treffer sind i18n-Labels, Enum-Werte (`referenceTypeEnum` mit dem
Wert `"MACHINE"`) oder E2E-Assertions.

Es gibt kein `CrmCompany` — Kunde und Lieferant sind `CrmAddress` mit
`type: CUSTOMER | SUPPLIER | BOTH` (`prisma/schema.prisma:465-533`).
`CrmAddress` trägt bereits eine eigene Hierarchie (`AddressHierarchy`,
Self-Relation auf `parentAddressId`). `Order`
(`prisma/schema.prisma:2335-2368`) kennt keinen Objekt-Bezug; der
Kundenfeld-Inhalt ist ein Freitext-String.

Muster, auf die aufgesetzt wird:

- **Adjacency-List-Hierarchien**: `Department.DepartmentTree`
  (`schema.prisma:1768-1794`), `WhArticleGroup.ArticleGroupTree`
  (`schema.prisma:5139-5155`), `CrmAddress.AddressHierarchy`
  (`schema.prisma:465-533`).
- **Pro-Entität-Attachments**: `CrmCorrespondenceAttachment`
  (`schema.prisma:735-752`), `HrPersonnelFileAttachment`
  (`schema.prisma:5734-5752`). Kein zentrales polymorphes Modell.
- **App-Layer-Multi-Tenancy**: `tenantProcedure`
  (`src/trpc/init.ts:354-382`), Header `x-tenant-id`.
- **`<namespace>.<action>`-Permissions**: katalogisiert in
  `src/lib/auth/permission-catalog.ts`, UUID-v5-IDs.
- **Service + Repository**: Signatur
  `(prisma, tenantId, input, auditCtx)`; Error-Klassen
  `*NotFoundError`, `*ValidationError`, `*ConflictError`,
  `*ForbiddenError`; Router fängt mit `handleServiceError` aus
  `src/trpc/errors.ts`.
- **Audit-Log**: `AuditLog` tenant-scoped, `PlatformAuditLog`
  operator-scoped (`src/lib/services/audit-logs-service.ts`,
  Dual-Write via Impersonation-Context).
- **QR-Codes**: Payload-Format `TERP:ART:{first6CharsOfTenantUuid}:{num}`
  (`src/lib/services/wh-qr-service.ts:40-52`), Library `qrcode`
  (Server) + `html5-qrcode` (Client), PDF-Label via
  `@react-pdf/renderer` (`src/lib/pdf/qr-label-pdf.tsx`).
- **CSV-Import**: Referenz ist `payroll-bulk-import-service.ts` —
  hand-rolled Parser, Base64 in tRPC-Body, Zwei-Phasen-Flow
  `parseFile` → `confirmImport`, Re-Validierung im Commit.

## Desired End State

Nach Abschluss existiert das Modul vollständig:

- Datenbank-Tabellen `service_objects` + `service_object_attachments`
  sowie Nullable-FK-Spalten `orders.service_object_id` und
  `wh_stock_movements.service_object_id`.
- Ein Supabase-Storage-Bucket `serviceobject-attachments`.
- Services `service-object-service.ts`,
  `service-object-repository.ts`,
  `service-object-attachment-service.ts`,
  `service-object-import-service.ts`,
  `service-object-qr-service.ts` sowie eine extrahierte
  `qr-utils.ts` (shared mit `wh-qr-service.ts`).
- tRPC-Router `serviceObjects.ts` registriert in `_app.ts`.
- UI-Seiten unter `/serviceobjects` (Liste, Detail, Baum, Import)
  + Anpassung des Withdrawal-Terminals.
- Drei Permissions `service_objects.{view,manage,delete}` im Katalog.
- E2E-Browser-Test deckt den End-to-End-Flow ab.
- Handbuch-Abschnitt „Serviceobjekte" in `docs/TERP_HANDBUCH.md`.

### Key Discoveries:
- Attachment-Flow ist dreistufig (`getUploadUrl` → Client-PUT →
  `confirmUpload`). Ohne `confirmUpload` entsteht kein DB-Eintrag.
  Referenz: `src/lib/services/crm-correspondence-attachment-service.ts:151-268`.
- Buckets müssen an **zwei** Stellen deklariert werden:
  `supabase/config.toml` und eine Migrations-SQL-Datei mit
  `INSERT INTO storage.buckets ... ON CONFLICT DO NOTHING`.
  Referenz: `supabase/migrations/20260428000001_create_bank_statements_storage_bucket.sql:11-19`.
- Sidebar-Konfiguration lebt in
  `src/components/layout/sidebar/sidebar-nav-config.ts` (nicht in
  `src/components/sidebar.tsx` — Datei existiert nicht). Die CRM-
  Section (line 384) ist flach, `module: 'crm'` gated.
- `wh-qr-service.ts` ist eng an `whArticle` gekoppelt (regex mit
  hardcodiertem `ART`, `whArticle.findFirst`, article-PDF). Nur
  `buildQrContent` und `generateQrDataUrl` sind generisch und werden
  in eine `qr-utils.ts` extrahiert.
- Client-seitiger `qr-scanner.tsx` prüft in zwei Zeilen (71, 191)
  `TERP:ART:`. Für SO-Support ändern wir das zu einem generischen
  `TERP:`-Prefix; die Router-Schicht demultiplexiert `ART`/`SO`.
- Router `_app.ts` registriert neue Router durch Append am Ende der
  Imports (line 115-117) und am Ende des `appRouter`-Objekts
  (line 227-229). Keine alphabetische Ordnung.
- Prisma-Level-Enums erfordern Postgres `CREATE TYPE`
  (nicht das `VARCHAR CHECK(...)`-Muster der overtime-requests-
  Migration). Bestehendes Beispiel: `schema.prisma:5269-5278`
  `WhStockMovementType` — verwendet `enum`.
- Cycle-Detection folgt dem Set-basierten Ancestor-Walk
  (`department-service.ts:46-65`, `wh-article-group-service.ts:34-53`,
  `crm-address-service.ts:50-69`). Wir übernehmen zusätzlich den
  expliziten Self-Ref-Shortcut aus dem Department-Service.
- `WhStockMovement.cancelWithdrawal`
  (`wh-withdrawal-service.ts:290-309`) kopiert die Referenz-Felder
  beim Reversal-Insert — `serviceObjectId` muss dort mitgeführt werden.

## What We're NOT Doing

- **Keine** Deprecation oder Migration der bestehenden
  `WhStockMovement.machineId`-Spalte. Sie bleibt unberührt und wird
  weiterhin vom UI als separater Referenztyp unterstützt.
- **Keine** Modifikation des Freitext-Feldes `Order.customer`. Dessen
  Ablösung durch eine FK auf `CrmAddress` ist ein separates Ticket.
- **Keine** branchenspezifischen Profile (Prüffristen, Wartungspläne,
  DGUV-V3-Metadaten). Folgt in einem eigenen Ticket.
- **Keine** AI-Funktionen (Predictive Maintenance, Ersatzteil-Prognose).
- **Keine** `@relation`-Deklarationen zwischen Platform-Modellen und
  `ServiceObject`.
- **Keine** Verknüpfung mit `InboundInvoice` (kommt später als
  Kontierungsdimension).
- **Keine** Row-Level-Security-Policies. Multi-Tenancy bleibt
  App-Layer-enforced.
- **Keine** polymorphe Attachment-Tabelle.
- **Keine** Benutzerhandbuch-Seiten (`docs/benutzerhandbuecher/*.md`)
  in diesem Ticket — nur `TERP_HANDBUCH.md` bekommt einen Abschnitt.
- **Keine** Auto-Permission-Zuweisung an andere Gruppen als Admin.

## Implementation Approach

Bottom-up in sechs Phasen, jede Phase mit PAUSE+Commit-Vorschlag:

1. **Phase A** — Schema, Enums, Migration, Service, Repository, Audit.
2. **Phase B** — tRPC-Router, Hooks, Liste/Detail/Baum-UI, Sidebar.
3. **Phase C** — Attachments + QR-Generation + Scanner-Demux.
4. **Phase D** — Order-FK + Withdrawal-Parallel-Pfad.
5. **Phase E** — CSV-Import (Zwei-Phasen).
6. **Phase F** — E2E + Handbuch.

Datei-Budget (produktive Dateien, ohne Tests/Migrations): 20 max.

---

## Data Model

### ServiceObject

```prisma
model ServiceObject {
  id                 String                     @id @default(uuid()) @db.Uuid
  tenantId           String                     @map("tenant_id") @db.Uuid
  tenant             Tenant                     @relation(fields: [tenantId], references: [id])

  number             String                     @db.VarChar(50)
  name               String                     @db.VarChar(255)
  description        String?

  kind               ServiceObjectKind          @default(EQUIPMENT)
  parentId           String?                    @map("parent_id") @db.Uuid
  parent             ServiceObject?             @relation("ServiceObjectTree", fields: [parentId], references: [id], onDelete: SetNull)
  children           ServiceObject[]            @relation("ServiceObjectTree")

  customerAddressId  String                     @map("customer_address_id") @db.Uuid
  customerAddress    CrmAddress                 @relation(fields: [customerAddressId], references: [id])

  internalNumber     String?                    @map("internal_number") @db.VarChar(100)
  manufacturer       String?                    @db.VarChar(255)
  model              String?                    @db.VarChar(255)
  serialNumber       String?                    @map("serial_number") @db.VarChar(255)
  yearBuilt          Int?                       @map("year_built")
  inServiceSince     DateTime?                  @map("in_service_since") @db.Date

  status             ServiceObjectStatus        @default(OPERATIONAL)
  isActive           Boolean                    @default(true) @map("is_active")

  qrCodePayload      String?                    @map("qr_code_payload")

  customFields       Json?                      @map("custom_fields")

  attachments        ServiceObjectAttachment[]
  orders             Order[]
  stockMovements     WhStockMovement[]

  createdAt          DateTime                   @default(now()) @map("created_at")
  updatedAt          DateTime                   @updatedAt @map("updated_at")
  createdById        String?                    @map("created_by_id") @db.Uuid

  @@unique([tenantId, number], map: "uq_service_objects_tenant_number")
  @@index([tenantId])
  @@index([tenantId, customerAddressId])
  @@index([tenantId, parentId])
  @@index([tenantId, isActive])
  @@index([tenantId, kind])
  @@map("service_objects")
}

enum ServiceObjectKind {
  SITE
  BUILDING
  SYSTEM
  EQUIPMENT
  COMPONENT

  @@map("service_object_kind")
}

enum ServiceObjectStatus {
  OPERATIONAL
  DEGRADED
  IN_MAINTENANCE
  OUT_OF_SERVICE
  DECOMMISSIONED

  @@map("service_object_status")
}

model ServiceObjectAttachment {
  id                String         @id @default(uuid()) @db.Uuid
  tenantId          String         @map("tenant_id") @db.Uuid
  tenant            Tenant         @relation(fields: [tenantId], references: [id])

  serviceObjectId   String         @map("service_object_id") @db.Uuid
  serviceObject     ServiceObject  @relation(fields: [serviceObjectId], references: [id], onDelete: Cascade)

  filename          String         @db.VarChar(255)
  storagePath       String         @map("storage_path")
  mimeType          String         @map("mime_type") @db.VarChar(100)
  sizeBytes         Int            @map("size_bytes")

  uploadedAt        DateTime       @default(now()) @map("uploaded_at")
  uploadedById      String?        @map("uploaded_by_id") @db.Uuid

  @@index([tenantId, serviceObjectId])
  @@map("service_object_attachments")
}
```

### Zusätzliche Schema-Änderungen

- `Order`:
  ```prisma
  serviceObjectId  String?        @map("service_object_id") @db.Uuid
  serviceObject    ServiceObject? @relation(fields: [serviceObjectId], references: [id], onDelete: SetNull)
  @@index([tenantId, serviceObjectId])
  ```
- `WhStockMovement`:
  ```prisma
  serviceObjectId  String?        @map("service_object_id") @db.Uuid
  serviceObject    ServiceObject? @relation(fields: [serviceObjectId], references: [id], onDelete: SetNull)
  @@index([tenantId, serviceObjectId])
  ```
- `CrmAddress` erhält inverse Relation:
  ```prisma
  serviceObjects   ServiceObject[]
  ```
- `Tenant` erhält inverse Relationen:
  ```prisma
  serviceObjects            ServiceObject[]
  serviceObjectAttachments  ServiceObjectAttachment[]
  ```

### Nullable-Übersicht

Pflicht-Felder: `id, tenantId, number, name, customerAddressId, kind, status, isActive, createdAt, updatedAt`. Alle anderen Felder sind nullable (gemäß Hard Rule).

---

## Service Layer

### 1. `src/lib/services/service-object-repository.ts`

Kanonische Prisma-Queries analog zu `crm-address-repository.ts`.

Funktionen:
- `findMany(prisma, tenantId, params?: { customerAddressId?, parentId?, kind?, status?, search?, isActive?, page?, pageSize? })`
- `findById(prisma, tenantId, id)` — mit Includes `customerAddress`, `parent`, `_count: { children, attachments }`
- `findAllForTree(prisma, tenantId, customerAddressId)` — flach, für Client-Assembly
- `findByNumber(prisma, tenantId, number)` — für CSV-Import-Duplicate-Check
- `findParentId(prisma, tenantId, id)` — für Cycle-Detection-Walk
- `countChildren(prisma, tenantId, id)`
- `countLinkedOrders(prisma, tenantId, id)` — für Hard-Delete-Gate
- `countLinkedStockMovements(prisma, tenantId, id)` — für Hard-Delete-Gate
- `create(prisma, data)` — einzelne Anlage
- `createMany(prisma, data[])` — wird intern nicht genutzt; bulk geht über
  Service-Transaktion mit `create` pro Zeile (siehe Import-Service).
- `update(prisma, tenantId, id, data)`
- `softDelete(prisma, tenantId, id)` — setzt `isActive = false`
- `hardDelete(prisma, tenantId, id)` — nur wenn keine Verknüpfungen

Alle Queries filtern `{ tenantId, id }` im `where`; `findFirst` statt
`findUnique` auf Keys, die nicht DB-unique sind.

### 2. `src/lib/services/service-object-service.ts`

Business-Logik.

Error-Klassen:
```ts
export class ServiceObjectNotFoundError extends Error {}
export class ServiceObjectValidationError extends Error {}
export class ServiceObjectConflictError extends Error {}
export class ServiceObjectForbiddenError extends Error {}
```

Exports:
- `listServiceObjects(prisma, tenantId, params?)`
- `getServiceObjectById(prisma, tenantId, id)`
- `getServiceObjectTree(prisma, tenantId, customerAddressId)` —
  Flat-Fetch, Client-Assembly
- `createServiceObject(prisma, tenantId, input, auditCtx)`
- `updateServiceObject(prisma, tenantId, id, input, auditCtx)`
- `moveServiceObject(prisma, tenantId, id, newParentId, auditCtx)` —
  eigener Endpoint wie `crm-address.setParent`
- `deleteServiceObject(prisma, tenantId, id, auditCtx)` — Soft-Delete
- `hardDeleteServiceObject(prisma, tenantId, id, auditCtx)` — wird
  intern gerufen, wenn Verknüpfungen 0 sind; sonst Soft-Delete
- `regenerateQrPayload(prisma, tenantId, id)` — interne Helper

**Validierungen (Service-Layer):**

Alle Create/Update-Pfade:
- `name`: nicht-leer, max 255
- `number`: nicht-leer, max 50, Unique pro Tenant (`ServiceObjectConflictError`)
- `customerAddressId`: muss existieren, gleicher Tenant, `type IN ('CUSTOMER', 'BOTH')`
- `parentId`: falls gesetzt, muss existieren, gleicher Tenant, **nicht id selbst**, **keine Zyklen**, **gleicher customerAddressId wie das Kind** (Geschwister dürfen nur derselben Kundenhierarchie angehören)
- `yearBuilt`: falls gesetzt, zwischen 1900 und aktuelles Jahr + 1

**Cycle-Detection** (kopiert aus `department-service.ts:46-65`):

```ts
async function checkCircularReference(
  prisma: PrismaClient, tenantId: string, movingId: string, proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([movingId])
  let current: string | null = proposedParentId
  while (current) {
    if (visited.has(current)) return true
    visited.add(current)
    const rec = await repo.findParentId(prisma, tenantId, current)
    if (!rec) return false
    current = rec.parentId
  }
  return false
}
```

Aufgerufen in `update` und `move` nur wenn `parentId !== undefined && parentId !== existing.parentId && parentId !== null`. Explizite Self-Ref-Prüfung (`parentId === id`) vorangestellt.

**QR-Payload-Caching:** Bei `create` und bei Änderungen an `number`
wird `qrCodePayload = buildServiceObjectQrContent(tenantId, number)`
aktualisiert (idempotent).

**Audit-Tracked-Felder:**

```ts
const TRACKED_FIELDS = [
  "number", "name", "kind", "parentId", "customerAddressId",
  "manufacturer", "model", "serialNumber", "yearBuilt",
  "inServiceSince", "status", "isActive",
] as const
```

Audit-Log wird geschrieben via `auditLog.log(prisma, {...})` bei
`create`, `update`, `delete` (soft+hard), `move`. `entityType =
"ServiceObject"`, `entityName = name`, `changes = computeChanges(
before, after, TRACKED_FIELDS)`.

### 3. `src/lib/services/service-object-attachment-service.ts`

Exakte Struktur-Kopie von `crm-correspondence-attachment-service.ts`,
adaptiert:

```ts
const BUCKET = "serviceobject-attachments"
const SIGNED_URL_EXPIRY_SECONDS = 3600
const MAX_SIZE_BYTES = 10 * 1024 * 1024      // 10 MB
const MAX_ATTACHMENTS_PER_SERVICE_OBJECT = 20
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
```

Exports:
- `listAttachments(prisma, tenantId, serviceObjectId)`
- `getUploadUrl(prisma, tenantId, serviceObjectId, filename, mimeType)`
  — issues signed PUT URL an `${tenantId}/${serviceObjectId}/${uuid}.${ext}`
- `confirmUpload(prisma, tenantId, serviceObjectId, storagePath, filename, mimeType, sizeBytes, createdById, audit?)` — re-validiert MIME+Size, schreibt Row
- `getDownloadUrl(prisma, tenantId, attachmentId)`
- `deleteAttachment(prisma, tenantId, attachmentId, audit?)` — löscht Storage-Objekt + Row
- `deleteAllByServiceObject(prisma, tenantId, serviceObjectId)` —
  nur Storage (DB-Cascade via Foreign-Key onDelete: Cascade)

Error-Klassen:
`ServiceObjectAttachmentNotFoundError`,
`ServiceObjectAttachmentValidationError`.

Audit: `action: "upload"` / `"delete"`, `entityType: "service_object_attachment"`.

### 4. `src/lib/services/service-object-qr-service.ts`

Dedizierte QR-Logik (nicht in `wh-qr-service.ts`).

```ts
import { buildQrContent, generateQrDataUrl } from "./qr-utils"

const QR_PREFIX = "TERP:SO:"
const QR_REGEX = /^TERP:SO:([a-f0-9]{6}):(.+)$/

export function buildServiceObjectQrContent(tenantId: string, number: string): string {
  return buildQrContent("SO", tenantId, number)   // shared util
}

export async function resolveServiceObjectQrCode(
  prisma: PrismaClient, tenantId: string, rawCode: string
) { /* regex-parse, tenantShort-Check, findFirst(number, isActive=true) */ }

export async function resolveServiceObjectByNumber(
  prisma: PrismaClient, tenantId: string, number: string
) { /* same lookup without parsing */ }

export async function generateServiceObjectQrDataUrl(
  prisma: PrismaClient, tenantId: string, id: string
): Promise<{ dataUrl, content, serviceObject }> { /* ... */ }

export async function generateServiceObjectLabelPdf(
  prisma: PrismaClient, tenantId: string, ids: string[], format: LabelFormat
): Promise<{ signedUrl, filename }> { /* reuse QrLabelPdf */ }
```

Error-Klassen:
`ServiceObjectQrValidationError`,
`ServiceObjectQrNotFoundError`,
`ServiceObjectQrForbiddenError`.

**PDF-Label:** Reuse `QrLabelPdf` aus `src/lib/pdf/qr-label-pdf.tsx`.
Die `LabelData`-Felder `articleNumber`, `articleName`, `unit` werden
mit ServiceObject-Daten befüllt:
- `articleNumber` ← `number`
- `articleName` ← `name` (getruncated auf 30 Zeichen vom bestehenden
  Komponenten-Code)
- `unit` ← `customerAddress.company` (Kunde)

Der Komponenten-Code selbst wird nicht angefasst (nur semantische
Umwidmung der Felder).

Upload-Bucket für PDF: `"documents"` (analog zu `wh-qr-service.ts:41`).

### 5. `src/lib/services/qr-utils.ts` (neu)

Extraktion der zwei generischen Helpers aus `wh-qr-service.ts`:

```ts
export function buildQrContent(
  entityType: "ART" | "SO", tenantId: string, number: string
): string {
  return `TERP:${entityType}:${tenantId.substring(0, 6)}:${number}`
}

export async function generateQrDataUrl(content: string, size?: number): Promise<string> {
  const QRCode = (await import("qrcode")).default
  return QRCode.toDataURL(content, { width: size ?? 150, margin: 1 })
}
```

**Anpassung an `wh-qr-service.ts`:** Ersetze die beiden lokalen
Funktionen durch `import` aus `qr-utils.ts` und `buildQrContent("ART",
tenantId, articleNumber)`. Kein API-Break (die Helper waren intern).

### 6. `src/lib/services/service-object-import-service.ts`

CSV-Import nach Vorbild `payroll-bulk-import-service.ts`.

**Format:**
- Pflichtspalten: `number, name, customerAddressNumber`
- Optionale Spalten: `kind, parentNumber, internalNumber, manufacturer, model, serialNumber, yearBuilt, inServiceSince, description`
- Trennzeichen-Auto-Detection: `;` oder `,` oder `\t`
- UTF-8-BOM-Stripping

**API:**
```ts
parseServiceObjectImport(
  prisma: PrismaClient, tenantId: string,
  fileBase64: string, filename: string
): Promise<ParseResult>

confirmServiceObjectImport(
  prisma: PrismaClient, tenantId: string,
  fileBase64: string, filename: string, auditCtx: AuditContext
): Promise<{ created: number, failedRows: FailedRow[] }>
```

**ParseResult:**
```ts
{
  rows: Array<{ rowIndex: number, data: ServiceObjectImportRow, errors: string[] }>,
  rowCount: number,
  validCount: number,
  invalidCount: number,
  resolvedCustomerAddresses: Record<string, string>,   // number → id
  unresolvedCustomerAddresses: string[],
  duplicateNumbers: string[],                          // vs. DB
  hasErrors: boolean,
}
```

**Validierungen pro Zeile:**
- `number`: nicht-leer, nicht duplikat innerhalb CSV, nicht in DB existent
- `name`: nicht-leer
- `customerAddressNumber`: muss zu CrmAddress mit `type IN (CUSTOMER, BOTH)` auflösen
- `parentNumber`: entweder in CSV (später im Batch) oder in DB existent — Reihenfolge wird vom Commit per topologischem Sort aufgelöst
- `kind`: `SITE|BUILDING|SYSTEM|EQUIPMENT|COMPONENT`, Default `EQUIPMENT`
- `yearBuilt`: Integer 1900..currentYear+1
- `inServiceSince`: ISO-Date YYYY-MM-DD
- **Zyklen**: Aufruf `checkImportCycles(rows)` — Tiefensuche über `parentNumber`

**Commit-Transaktion:**
- `prisma.$transaction(tx => {...}, { timeout: 60_000, maxWait: 10_000 })`
- Re-validiert den kompletten File (gleiches Muster wie `payroll-bulk-import-service.ts:443`)
- Topologischer Sort: Root-Knoten zuerst, dann Kinder — `parentId` pro Zeile nach Einfügung aus einer `Map<number,id>` auflösen
- Pro Zeile `repo.create(...)` + Audit-Log `action: "bulk_import"`
- Partial-Failure: einzelne Zeile wird als `FailedRow` gesammelt, Transaction committet erfolgreiche Zeilen (analog payroll)

**Zyklenschutz vor Commit:** `checkImportCycles` baut eine
`Map<number, Set<ancestors>>` und verweigert Commit bei Selbst-
Referenz oder Zyklus.

---

## tRPC Layer

### `src/trpc/routers/serviceObjects.ts`

Unterliegt **`tenantProcedure`** + **`requireModule('crm')`** (analog
`crmProcedure` in `src/trpc/routers/crm/addresses.ts:17`). Wenn kein
`crmProcedure`-Helper reexportiert ist, deklarieren wir eine lokale
Konstante `const serviceObjectProcedure = tenantProcedure.use(requireModule('crm'))`.

**Permissions-Constants:**
```ts
const SO_VIEW   = permissionIdByKey("service_objects.view")!
const SO_MANAGE = permissionIdByKey("service_objects.manage")!
const SO_DELETE = permissionIdByKey("service_objects.delete")!
```

**Prozeduren:**

| Prozedur | Middleware | Input | Output |
|---|---|---|---|
| `list` | `requirePermission(SO_VIEW)` | `{ customerAddressId?, parentId?, kind?, status?, search?, isActive?, page?, pageSize? }` | `{ items, total }` |
| `getById` | `requirePermission(SO_VIEW)` | `{ id }` | `ServiceObjectDTO` |
| `getTree` | `requirePermission(SO_VIEW)` | `{ customerAddressId }` | `ServiceObjectTreeNode[]` |
| `create` | `requirePermission(SO_MANAGE)` | full input | `ServiceObjectDTO` |
| `update` | `requirePermission(SO_MANAGE)` | `{ id, ...fields }` | `ServiceObjectDTO` |
| `move` | `requirePermission(SO_MANAGE)` | `{ id, parentId: uuid \| null }` | `ServiceObjectDTO` |
| `delete` | `requirePermission(SO_DELETE)` | `{ id }` | `{ success: true, mode: 'soft' \| 'hard' }` |
| `getAttachments` | `requirePermission(SO_VIEW)` | `{ serviceObjectId }` | `AttachmentDTO[]` |
| `getUploadUrl` | `requirePermission(SO_MANAGE)` | `{ serviceObjectId, filename, mimeType }` | `{ signedUrl, storagePath, token }` |
| `confirmUpload` | `requirePermission(SO_MANAGE)` | `{ serviceObjectId, storagePath, filename, mimeType, sizeBytes }` | `AttachmentDTO` |
| `deleteAttachment` | `requirePermission(SO_MANAGE)` | `{ attachmentId }` | `{ success: true }` |
| `getDownloadUrl` | `requirePermission(SO_VIEW)` | `{ attachmentId }` | `{ signedUrl }` |
| `generateQrPdf` | `requirePermission(SO_VIEW)` | `{ ids: uuid[], format: 'AVERY_L4736' \| 'AVERY_L4731' }` | `{ signedUrl, filename }` |
| `generateSingleQr` | `requirePermission(SO_VIEW)` | `{ id }` | `{ dataUrl, content, serviceObject }` |
| `scanByQr` | `requirePermission(SO_VIEW)` | `{ code: string }` | `{ serviceObjectId, redirectUrl }` |
| `importPreview` | `requirePermission(SO_MANAGE)` | `{ fileBase64, filename }` | `ParseResult` |
| `importCommit` | `requirePermission(SO_MANAGE)` | `{ fileBase64, filename }` | `{ created, failedRows }` |

Alle Mutationen fangen Fehler mit `handleServiceError(err)` aus
`src/trpc/errors.ts`.

### Router-Integration in `_app.ts`

Append am Ende der Import-Block-Zeilen (nach line 117):
```ts
import { serviceObjectsRouter } from "./serviceObjects"
```

Append am Ende des `appRouter`-Objekts (nach line 229):
```ts
serviceObjects: serviceObjectsRouter,
```

### Permission-Catalog-Einträge

In `src/lib/auth/permission-catalog.ts` in der `ALL_PERMISSIONS`-
Liste (geeigneter Block nahe den CRM-Permissions):

```ts
p("service_objects.view",   "service_objects", "view",   "Serviceobjekte anzeigen"),
p("service_objects.manage", "service_objects", "manage", "Serviceobjekte erstellen und bearbeiten"),
p("service_objects.delete", "service_objects", "delete", "Serviceobjekte löschen"),
```

Admin-Gruppe bekommt alle drei automatisch (bestehende Admin-hat-alles-
Logik). Keine weiteren Auto-Assigns.

---

## UI Layer

### Neue Seiten

1. **`src/app/[locale]/(dashboard)/serviceobjects/page.tsx`** —
   Liste mit Filtern (Kunde, Status, Kind, Search), paginiert.
2. **`src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx`** —
   Detail mit Tabs: Übersicht, Baum-Position, Anhänge, Verknüpfte Aufträge.
3. **`src/app/[locale]/(dashboard)/serviceobjects/tree/page.tsx`** —
   Baum-Ansicht pro Kunde (Customer-Picker oben).
4. **`src/app/[locale]/(dashboard)/serviceobjects/import/page.tsx`** —
   CSV-Import-Wizard (File-Picker, Preview, Commit).

### Neue Components

- `src/components/serviceobjects/service-object-form-sheet.tsx` —
  Sheet (Create/Edit), Felder: number, name, description, kind,
  parentId (Picker), customerAddressId (Picker), manufacturer, model,
  serialNumber, yearBuilt, inServiceSince, status.
- `src/components/serviceobjects/service-object-tree-view.tsx` +
  `service-object-tree-node.tsx` — rekursive Render-Komponenten,
  Struktur-Klon von `src/components/departments/department-tree-view.tsx`
  und `department-tree-node.tsx`, mit `expandedIds: Set<string>`,
  auto-expand-on-first-load.
- `src/components/serviceobjects/service-object-picker.tsx` —
  Combobox mit Suche (wiederverwendbar für Withdrawal-Terminal und
  Order-Form); Filter: `customerAddressId` + `isActive=true`.
- `src/components/serviceobjects/attachment-list.tsx` — zeigt
  Attachments, „Hochladen"-Button (drei-Schritt-Flow), Download-Link,
  Delete-Button.
- `src/components/serviceobjects/qr-label-button.tsx` — Triggert
  `generateQrPdf` und öffnet Signed-URL.

### Neue Hooks

`src/hooks/use-service-objects.ts` — wrapping tRPC queries/mutations:
- `useServiceObjects(params?)`
- `useServiceObject(id)`
- `useServiceObjectTree(customerAddressId)`
- `useCreateServiceObject()`, `useUpdateServiceObject()`, `useDeleteServiceObject()`, `useMoveServiceObject()`
- `useServiceObjectAttachments(id)`, `useGetUploadUrl()`, `useConfirmUpload()`, `useDeleteAttachment()`, `useGetDownloadUrl()`
- `useGenerateQrPdf()`, `useGenerateSingleQr(id)`, `useScanByQr()`
- `useImportPreview()`, `useImportCommit()`

Barrel-Export in `src/hooks/index.ts` wie bei `use-overtime-requests.ts` (lines 1224-1237).

### Anpassung Withdrawal-Terminal

**`src/components/warehouse/withdrawal-terminal.tsx`:**

- Line 30: `ReferenceType` Union um `'SERVICE_OBJECT'` erweitern.
- Line 53-83: `REF_TYPE_CONFIG` neuen Eintrag appenden:
  ```ts
  { value: 'SERVICE_OBJECT', labelKey: 'refTypeServiceObject',
    descKey: 'refTypeServiceObjectDesc', icon: Building2 }
  ```
  (neuer Icon-Import `Building2` aus `lucide-react`).
- Line 42: State-Feld `serviceObjectId: string` ergänzen.
- Line 107-111: `canProceedFromStep1` neue Branch für `SERVICE_OBJECT`:
  `return state.serviceObjectId.trim().length > 0`.
- Line 154-181 (`handleWithdraw`): Payload-Feld
  `serviceObjectId: state.referenceType === 'SERVICE_OBJECT' ? state.serviceObjectId || undefined : undefined`.
- Line 199-203 (`getReferenceValue`): Case für `SERVICE_OBJECT` →
  `state.serviceObjectId`.
- Neue Combobox `<ServiceObjectPicker />` statt `<Input />` wenn
  `referenceType === 'SERVICE_OBJECT'` (Render-Branch neben den
  existierenden Zeilen 314-337).

### Sidebar-Integration

**`src/components/layout/sidebar/sidebar-nav-config.ts`**, CRM-Section
(line 384-417), Append an `items[]`:

```ts
{
  titleKey: 'crmServiceObjects',
  href: '/serviceobjects',
  icon: Building2,
  module: 'crm',
  permissions: ['service_objects.view'],
},
```

`Building2` muss aus `lucide-react` in der bestehenden Import-Gruppe
ergänzt werden.

### i18n-Strings

Neue Keys in `messages/de.json` und `messages/en.json`:
- `nav.crmServiceObjects`, `nav.overtimeRequests`-Style
- Modul-Keys `serviceObjects.title`, `serviceObjects.list.*`,
  `serviceObjects.form.*`, `serviceObjects.tree.*`,
  `serviceObjects.import.*`, `serviceObjects.attachments.*`,
  `serviceObjects.qr.*`, `serviceObjects.status.*`, `serviceObjects.kind.*`
- `refTypeServiceObject`, `refTypeServiceObjectDesc`,
  `refPlaceholderServiceObject` (Warehouse-Seitenleiste analog
  `refTypeMachine` in line 6479-6483 von `de.json`).

### QR-Scanner-Demux

**`src/components/warehouse/qr-scanner.tsx`:**

- Line 71 und 191: Check von `decodedText.startsWith('TERP:ART:')` →
  `decodedText.startsWith('TERP:')`.
- Neuer Prop `allowedPrefixes?: string[]` (Default
  `['TERP:ART:', 'TERP:SO:']`), wird für Filterung verwendet.

**ScannerTerminal** (`scanner-terminal.tsx`) bleibt unverändert —
der ServiceObjekt-Scanner-Flow bekommt keinen eigenen
Scanner-Terminal-Klon in diesem Ticket. Für ServiceObjekte nutzt man
den Detail-Seiten-Scan-Button (klein), der `resolveServiceObjectQrCode`
aufruft und auf die Detail-Seite navigiert.

---

## Migrations

Fünf Migrationsdateien, chronologisch nummeriert:

### 1. `supabase/migrations/20260504000000_create_service_object_enums.sql`

```sql
CREATE TYPE service_object_kind AS ENUM (
  'SITE', 'BUILDING', 'SYSTEM', 'EQUIPMENT', 'COMPONENT'
);
CREATE TYPE service_object_status AS ENUM (
  'OPERATIONAL', 'DEGRADED', 'IN_MAINTENANCE', 'OUT_OF_SERVICE', 'DECOMMISSIONED'
);
```

### 2. `supabase/migrations/20260504000001_create_service_objects.sql`

```sql
CREATE TABLE service_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  kind service_object_kind NOT NULL DEFAULT 'EQUIPMENT',
  parent_id UUID REFERENCES service_objects(id) ON DELETE SET NULL,
  customer_address_id UUID NOT NULL REFERENCES crm_addresses(id),
  internal_number VARCHAR(100),
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  serial_number VARCHAR(255),
  year_built INT,
  in_service_since DATE,
  status service_object_status NOT NULL DEFAULT 'OPERATIONAL',
  is_active BOOLEAN NOT NULL DEFAULT true,
  qr_code_payload TEXT,
  custom_fields JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID,
  CONSTRAINT uq_service_objects_tenant_number UNIQUE (tenant_id, number)
);

CREATE INDEX idx_service_objects_tenant ON service_objects(tenant_id);
CREATE INDEX idx_service_objects_tenant_customer ON service_objects(tenant_id, customer_address_id);
CREATE INDEX idx_service_objects_tenant_parent ON service_objects(tenant_id, parent_id);
CREATE INDEX idx_service_objects_tenant_active ON service_objects(tenant_id, is_active);
CREATE INDEX idx_service_objects_tenant_kind ON service_objects(tenant_id, kind);

CREATE TRIGGER service_objects_updated_at
  BEFORE UPDATE ON service_objects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3. `supabase/migrations/20260504000002_create_service_object_attachments.sql`

```sql
CREATE TABLE service_object_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_object_id UUID NOT NULL REFERENCES service_objects(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_id UUID
);

CREATE INDEX idx_service_object_attachments_tenant_object
  ON service_object_attachments(tenant_id, service_object_id);
```

### 4. `supabase/migrations/20260504000003_add_service_object_fk_to_orders.sql`

```sql
ALTER TABLE orders
  ADD COLUMN service_object_id UUID
    REFERENCES service_objects(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_tenant_service_object
  ON orders(tenant_id, service_object_id)
  WHERE service_object_id IS NOT NULL;
```

### 5. `supabase/migrations/20260504000004_add_service_object_fk_to_wh_stock_movements.sql`

```sql
ALTER TABLE wh_stock_movements
  ADD COLUMN service_object_id UUID
    REFERENCES service_objects(id) ON DELETE SET NULL;

CREATE INDEX idx_wh_stock_movements_tenant_service_object
  ON wh_stock_movements(tenant_id, service_object_id)
  WHERE service_object_id IS NOT NULL;
```

### 6. `supabase/migrations/20260504000005_create_service_object_attachments_storage_bucket.sql`

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'serviceobject-attachments',
  'serviceobject-attachments',
  false,
  10485760, -- 10 MiB
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;
```

### 7. `supabase/config.toml` — Bucket-Eintrag

Unter `[storage.buckets]`:
```toml
[storage.buckets.serviceobject-attachments]
public = false
file_size_limit = "10MiB"
allowed_mime_types = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
```

---

## Tests

### Unit Tests (Vitest, tenant-scoped, transaktions-isoliert)

1. **`src/lib/services/__tests__/service-object-service.test.ts`**
   - Create: Happy-Path, Doppelte `number` → Conflict, ungültige
     `customerAddressId` (nicht CUSTOMER/BOTH) → Validation
   - **Create: rejects customerAddressId from different tenant** —
     Angriffs-Simulation: User aus Tenant A ruft `createServiceObject`
     mit einem `customerAddressId` auf, der einer `CrmAddress` in
     Tenant B gehört. Der Validierungs-Check in
     `service-object-service.ts` muss mit
     `ServiceObjectValidationError` fehlschlagen, **bevor** eine
     Row angelegt wird. Setup: seed 2 Tenants + 1 CrmAddress pro
     Tenant; `findFirst({ where: { id: addressFromB, tenantId: tenantA } })`
     darf `null` liefern (Prisma respektiert `tenantId`-Filter
     unabhängig vom `id`-Match). Assertion: Aufruf wirft
     `ServiceObjectValidationError`; `service_objects`-Count in
     beiden Tenants bleibt 0.
   - Update: Audit-Changes korrekt, Parent-Change triggert
     Cycle-Check, Self-Ref wird abgewiesen
   - **Update: rejects customerAddressId change to different tenant**
     — Analogie zu oben: Bei Update von `customerAddressId` greift
     dieselbe Tenant-Ownership-Prüfung.
   - Move: Zyklus in 3-Ebenen-Hierarchie → Validation,
     Non-Cycle-Move erfolgreich
   - Delete: Soft-Delete wenn Verknüpfungen existieren,
     Hard-Delete wenn keine
   - QR-Payload: wird bei Create gesetzt, bei `number`-Update
     aktualisiert

2. **`src/lib/services/__tests__/service-object-repository.test.ts`**
   - Tenant-Isolation (2 Tenants, `findMany` liefert nur eigene)
   - `findParentId` Ancestor-Walk
   - Filter-Kombinationen

3. **`src/lib/services/__tests__/service-object-attachment-service.test.ts`**
   - Upload-Flow (`getUploadUrl` → `confirmUpload`)
   - MIME-Block
   - Size-Block
   - Count-Limit (20 pro ServiceObject)
   - Delete-Flow (Storage + DB)
   - Cross-Tenant-Access blockiert

4. **`src/lib/services/__tests__/service-object-qr-service.test.ts`**
   - Payload-Parsing (gültig, ungültig, falscher Prefix)
   - Tenant-Validation (Cross-Tenant-Payload)
   - `generateLabelPdf` Happy-Path

5. **`src/lib/services/__tests__/service-object-import-service.test.ts`**
   - Parse-Phase: Valid CSV, UTF-8-BOM, `;`-Separator
   - Validierungen: duplicate `number`, unresolved customer,
     invalid `kind`, year out-of-range, cycle via `parentNumber`
   - Commit-Phase: Topologischer Sort (Parent vor Child),
     Partial-Failure-Handling

6. **`src/trpc/routers/__tests__/serviceObjects-router.test.ts`**
   - Permission-Checks (view/manage/delete)
   - Tenant-Header-Validation
   - Move-Procedure separater Endpoint

### E2E-Browser-Test

**`src/e2e-browser/81-service-objects.spec.ts`:**

1. Login als Admin
2. Navigiere zu `/serviceobjects`
3. Lege ServiceObject an (minimaler Satz: number, name, customer)
4. Lege Child-ServiceObject an
5. Öffne Baum-Ansicht, prüfe Parent-Child-Struktur
6. Detail: Upload einer Test-PDF, Prüfe Signed-URL-Download
7. Detail: Generiere QR-Label-PDF, prüfe Signed-URL
8. Simuliere QR-Scan via Manual-Input: `TERP:SO:xxxxxx:NUM`,
   prüfe Redirect auf Detail
9. Wechsle zu `/admin/orders`, lege Order an, wähle ServiceObject
10. Wechsle zu `/warehouse/withdrawals`, starte Entnahme, wähle
    Referenztyp „Serviceobjekt", wähle Objekt, führe Entnahme aus
11. Prüfe in Bewegungsliste: Entnahme zeigt ServiceObject-Ref
12. Soft-Delete ServiceObject (mit Verknüpfung) → Objekt wird
    inaktiv, Movements bleiben
13. Logout

Fixture-Helper `src/e2e-browser/helpers/service-object-fixtures.ts`
für wiederverwendbare Daten.

### Manual Testing Steps

Siehe „Phased Rollout" unten — jede Phase endet mit einer konkreten
manuellen Verifikations-Checkliste.

---

## Phased Rollout

Jede Phase schließt mit einer PAUSE + Commit-Vorschlag ab. Die
automatisierten Verifikationen müssen vor dem manuellen Durchgang
grün sein.

### Phase A — Schema, Migration, Service, Repository

**Umfang:** Prisma-Schema-Erweiterung, 6 Migrationen, Seed-Bucket,
`service-object-service.ts`, `service-object-repository.ts`, Error-
Klassen, Audit-Integration, Unit-Tests.

**Produktive Dateien (2):** `service-object-service.ts`,
`service-object-repository.ts`.

#### Automated Verification:
- [ ] `pnpm db:reset` — alle Migrationen applizieren sauber
- [ ] `pnpm db:generate` — Prisma-Client wird neu generiert
- [ ] `pnpm typecheck` — keine neuen TS-Fehler
- [ ] `pnpm vitest run src/lib/services/__tests__/service-object-service.test.ts` grün
- [ ] `pnpm vitest run src/lib/services/__tests__/service-object-repository.test.ts` grün
- [ ] `pnpm lint` — keine neuen Warnings

#### Manual Verification:
- [ ] Postgres-Tabelle `service_objects` existiert mit allen Indizes
- [ ] Enums `service_object_kind` und `service_object_status` existieren
- [ ] Bucket `serviceobject-attachments` in Supabase-Studio sichtbar
- [ ] Über `pnpm db:studio` einen Test-Datensatz anlegen, prüfen,
      dass Audit-Log-Zeile mit korrekten `changes` entsteht

**PAUSE — Commit: `Add ServiceObject schema, service, repository (Phase A)`**

---

### Phase B — tRPC-Router, Hooks, Liste/Detail/Baum, Sidebar

**Umfang:** `serviceObjects.ts` Router, Registrierung in `_app.ts`,
Permissions im Katalog, UI-Seiten Liste/Detail/Baum, Form-Sheet,
Tree-View-Komponenten, Picker, Sidebar-Entry, Hooks, i18n.

**Produktive Dateien (9):** `serviceObjects.ts`, `permission-catalog.ts`
(Append), `_app.ts` (2 Lines), `serviceobjects/page.tsx`,
`serviceobjects/[id]/page.tsx`, `serviceobjects/tree/page.tsx`,
`service-object-form-sheet.tsx`, `service-object-tree-view.tsx` +
`service-object-tree-node.tsx` (zählen als 1, sind zusammen eine
Komponente), `service-object-picker.tsx`, `use-service-objects.ts`,
`sidebar-nav-config.ts` (Append).

*(Hinweis: 9 Dateien, aber `_app.ts`, `permission-catalog.ts`,
`sidebar-nav-config.ts` sind Appends zu existierenden Dateien und
zählen im Budget mit, weil sie modifiziert werden.)*

#### Automated Verification:
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/serviceObjects-router.test.ts`
- [ ] `pnpm build` — Next.js Build ohne Fehler

#### Manual Verification:
- [ ] `/serviceobjects` Liste lädt, Filter wirken
- [ ] Anlage (Form-Sheet) funktioniert, Inline-Validierungen greifen
- [ ] Detail-Seite zeigt Tabs, Übersicht korrekt gefüllt
- [ ] Baum-Ansicht (mind. 3 Ebenen im Testdatensatz) rendert korrekt
- [ ] Move-Prozedur: Verschieben eines Knotens funktioniert,
      Zyklus-Versuch wird abgewiesen mit sinnvoller Fehlermeldung
- [ ] Soft-Delete setzt Status korrekt, Liste mit Filter `isActive=false`
      zeigt gelöschte Objekte
- [ ] Sidebar-Eintrag „Serviceobjekte" erscheint unter CRM, nur
      wenn CRM-Modul aktiv und Permission vorhanden

**PAUSE — Commit: `Add ServiceObject router, UI, sidebar (Phase B)`**

---

### Phase C — Attachments + QR-Code

**Umfang:** `service-object-attachment-service.ts`,
`service-object-qr-service.ts`, `qr-utils.ts` (Extraktion),
`wh-qr-service.ts` (Refactor auf qr-utils),
`qr-scanner.tsx` (Prefix-Demux), Attachment-Liste UI,
QR-Label-Button UI, Unit-Tests.

**Produktive Dateien (5):** `service-object-attachment-service.ts`,
`service-object-qr-service.ts`, `qr-utils.ts`, `attachment-list.tsx`,
`qr-label-button.tsx`. Edits an `wh-qr-service.ts` und
`qr-scanner.tsx` zählen zum Budget (+2 = 7).

#### Automated Verification:
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] Attachment-Service-Tests grün
- [ ] QR-Service-Tests grün
- [ ] Bestehende Warehouse-QR-Tests bleiben grün (Regression)

#### Manual Verification:
- [ ] Datei-Upload auf ServiceObject-Detail funktioniert:
      kleiner PDF, MIME-Violation wird abgelehnt,
      >10 MB wird abgelehnt
- [ ] Signed-URL-Download öffnet Datei im neuen Tab
- [ ] Delete-Attachment entfernt Storage-Objekt + DB-Row
- [ ] QR-Payload wird bei Create-ServiceObject gesetzt
      (`qrCodePayload` in DB)
- [ ] QR-Label-PDF lässt sich erzeugen, Etiketten enthalten
      number, name, customer (als „unit"-Feld)
- [ ] Scan via Manual-Input mit `TERP:SO:xxxxxx:NUM` leitet korrekt
      auf Detail-Seite
- [ ] Bestehender `TERP:ART:...`-Scan funktioniert weiterhin

**PAUSE — Commit: `Add ServiceObject attachments and QR code (Phase C)`**

---

### Phase D — Order-FK + Withdrawal-Parallel-Pfad

**Umfang:** Migration `add_service_object_fk_to_orders.sql`
(bereits in Phase A), Order-Form-Sheet-Feld, Order-Detail-Anzeige;
Migration `add_service_object_fk_to_wh_stock_movements.sql`
(bereits in Phase A), `referenceTypeEnum`-Erweiterung,
`resolveReferences`-Erweiterung, `cancelWithdrawal`-Copy,
`withdrawal-terminal.tsx`-Edits, `withdrawal-history.tsx`-Display,
Integrations-Tests.

**Produktive Dateien (4):** Edits an `order-form-sheet.tsx`,
`orders/[id]/page.tsx` (oder bestehende Detail-Komponente),
`warehouse/withdrawals.ts` (Router),
`wh-withdrawal-service.ts` (Service), `withdrawal-terminal.tsx`
(UI), `withdrawal-history.tsx` (UI). Macht 6 Edits, zählt als 4
neue/5 modifizierte.

#### Automated Verification:
- [ ] `pnpm typecheck`
- [ ] Bestehende Withdrawal-Tests grün (Regression)
- [ ] Neue Testfälle in `wh-withdrawal-service.test.ts`:
  - [ ] Create-Withdrawal mit `SERVICE_OBJECT`-Ref persistiert
        `serviceObjectId`
  - [ ] Create-Withdrawal mit `MACHINE`-Ref persistiert
        weiterhin `machineId`
  - [ ] Cancel-Withdrawal kopiert `serviceObjectId` ins Reversal
  - [ ] List-Filter nach `serviceObjectId` funktioniert

#### Manual Verification:
- [ ] Auftrag anlegen, ServiceObject-Picker wählen, speichern,
      Detail zeigt verknüpftes Objekt
- [ ] Auftragsdetail: Link zum ServiceObject funktioniert
- [ ] Withdrawal-Terminal: neue „Serviceobjekt"-Karte wird angezeigt
- [ ] Entnahme mit Serviceobjekt-Ref wird persistiert,
      Bewegungsliste zeigt Icon + Referenz
- [ ] Bestehende Entnahmen mit `machineId` werden korrekt weiterhin
      angezeigt (Regression)
- [ ] Löschen eines ServiceObjects (soft) lässt Order/Bewegungen
      intakt, Hard-Delete verboten (Guard im Service)

**PAUSE — Commit: `Link Orders and StockMovements to ServiceObject (Phase D)`**

---

### Phase E — CSV-Import

**Umfang:** `service-object-import-service.ts`,
`serviceobjects/import/page.tsx`, Router-Prozeduren
`importPreview`/`importCommit`, Hook-Wrapper.

**Produktive Dateien (2):** `service-object-import-service.ts`,
`serviceobjects/import/page.tsx`. Edits an `serviceObjects.ts`
Router (Append 2 Prozeduren) und `use-service-objects.ts` (Append
2 Hooks).

#### Automated Verification:
- [ ] `pnpm typecheck`
- [ ] Import-Service-Tests grün (Parse + Commit + Topologischer Sort)
- [ ] Error-Klassen werden korrekt zu 400/409 gemappt

#### Manual Verification:
- [ ] 20-Zeilen-Pro-Di-Beispiel-CSV:
  - [ ] Happy-Path: alle 20 Zeilen grün, Commit legt 20 Objekte an
  - [ ] Parent-Child-Reihenfolge im Tree korrekt
- [ ] Fehler-CSV:
  - [ ] `customerAddressNumber` nicht existent → rot mit Fehlertext
  - [ ] Duplicate `number` innerhalb CSV → rot
  - [ ] Zyklus über `parentNumber` → rot
  - [ ] Ungültiger `kind`-Wert → rot
- [ ] UI-Zustände: „Importieren"-Button disabled bei Errors,
      nach Commit Rückmeldung mit Count-Zahlen
- [ ] `TERP_HANDBUCH.md`-Abschnitt „Serviceobjekte → CSV-Import"
      als Step-by-Step-Klickanleitung vorhanden

**PAUSE — Commit: `Add ServiceObject CSV import (Phase E)`**

---

### Phase F — E2E + Handbuch

**Umfang:** E2E-Browser-Test-Spec + Helper, neuer Handbuch-Abschnitt
in `docs/TERP_HANDBUCH.md` nach Abschnitt 12 (CRM), vor Abschnitt 13.

**Produktive Dateien (0 — nur Docs + Tests).**

#### Automated Verification:
- [ ] `pnpm playwright test src/e2e-browser/81-service-objects.spec.ts`
      grün
- [ ] Playwright-Globalsetup-Cleanup löscht Testdaten idempotent
- [ ] Komplette E2E-Suite (`pnpm playwright test`) läuft ohne
      neue Failures

#### Manual Verification:
- [ ] Handbuch-Abschnitt als Step-by-Step-Klickanleitung lesbar
      (folgt dem „Praxisbeispiel"-Stil der bestehenden Abschnitte)
- [ ] Handbuch-Abschnitt enthält mindestens:
  - [ ] Was ist ein Serviceobjekt? (Branchen-Beispiele)
  - [ ] Anlage eines Objekts via UI
  - [ ] Hierarchie-Pflege (Baum-Ansicht, Move)
  - [ ] Dateianhänge
  - [ ] QR-Code-Druck + Scan im Feld
  - [ ] Verknüpfung mit Auftrag
  - [ ] Verknüpfung mit Lagerentnahme
  - [ ] CSV-Import
  - [ ] Soft-Delete vs. Hard-Delete

**PAUSE — Commit: `Add ServiceObject E2E tests and handbook section (Phase F)`**

---

## Performance Considerations

- `getTree` lädt alle ServiceObjects eines Kunden flach und baut den
  Baum clientseitig. Bei hunderten Objekten pro Kunde bleibt das
  unter 100 ms (single `findMany`). Keine N+1.
- Cycle-Detection-Walk ist O(Baum-Tiefe) mit einer Query pro Ebene.
  Für realistische Tiefen (<10) unkritisch.
- CSV-Import-Commit-Transaction hat Timeout 60s, MaxWait 10s. Bei
  10.000-Zeilen-Imports würde das reichen; größere Imports sind
  kein Ziel dieses Tickets.
- Withdrawal-Terminal: 5 statt 4 Karten im Grid — UI-Layout wird
  2×3 (asymmetrisch bei Odd-Count) oder 3×2. Kosmetisch erträglich;
  Design-Polish wäre separates Ticket.

## Migration Notes

- Keine Daten-Migration nötig. Alle neuen Spalten sind nullable.
- `WhStockMovement.machineId` bleibt unverändert und kann parallel
  genutzt werden.
- Tenants ohne CRM-Modul sehen den Sidebar-Eintrag nicht (Gate
  `module: 'crm'`), können aber theoretisch via direkter URL auf
  die Route — der Router gate’t mit `requireModule('crm')`.

## Hard Rules

- **Datei-Budget:** maximal 20 produktive Dateien (Tests,
  Migrationen, i18n-JSON und triviale Config-Appends wie
  `_app.ts`-Router-Registrierung, `permission-catalog.ts`-Append,
  `sidebar-nav-config.ts`-Append, `hooks/index.ts`-Re-Export,
  `schema.prisma`-Modell-Append zählen nicht).

  **Neu angelegte produktive Dateien (18):**
  - Phase A: `service-object-service.ts`,
    `service-object-repository.ts` (2)
  - Phase B: `serviceObjects.ts` (Router), `page.tsx`, `[id]/page.tsx`,
    `tree/page.tsx`, `service-object-form-sheet.tsx`,
    `service-object-tree-view.tsx`, `service-object-tree-node.tsx`,
    `service-object-picker.tsx`, `use-service-objects.ts` (9)
  - Phase C: `service-object-attachment-service.ts`,
    `service-object-qr-service.ts`, `qr-utils.ts`,
    `attachment-list.tsx`, `qr-label-button.tsx` (5)
  - Phase E: `service-object-import-service.ts`, `import/page.tsx` (2)

  **Substantielle Edits an bestehenden produktiven Dateien (8):**
  - Phase C: `wh-qr-service.ts` (Refactor auf qr-utils),
    `qr-scanner.tsx` (Prefix-Demux) (2)
  - Phase D: `order-form-sheet.tsx`, `orders/[id]/page.tsx`,
    `warehouse/withdrawals.ts` (Router),
    `wh-withdrawal-service.ts`, `withdrawal-terminal.tsx`,
    `withdrawal-history.tsx` (6)

  **Summe: 26 produktive Dateien — Überschreitung des 20er-Budgets
  um 6 ist bewusst akzeptiert.** Die 6 Phase-D-Edits (Order-FK +
  Withdrawal-Parallel-Pfad) sind nicht abtrennbar; sie setzen
  Architektur-Entscheidungen 6 und 7 des Tickets um. Jeder Edit
  ist klein (≤ 20 Zeilen Änderung). Ein Split in ein Folge-Ticket
  würde das Feature halb fertig lassen und wurde verworfen.
- **Keine** Modifikation von `Order.customer`-Freitext-Logik.
- **Keine** Deprecation von `WhStockMovement.machineId`.
- **Keine** `@relation`-Deklarationen zwischen Platform-Modellen
  und `ServiceObject`.
- **Alle** neuen Spalten sind nullable außer
  `ServiceObject.{id, tenantId, number, name, customerAddressId,
  kind, status, isActive, createdAt, updatedAt}`.
- Multi-Tenancy bleibt App-Layer. Keine Row-Level-Security-Policies
  neu angelegt.
- Permissions werden nur dem Admin zugewiesen. Keine Auto-Assigns.
- `InboundInvoice` bleibt außen vor.
- QR-Scanner behält Rückwärtskompatibilität mit `TERP:ART:`.
- Attachment-Flow ist dreistufig (`getUploadUrl` → Client-PUT →
  `confirmUpload`), nicht zweistufig.
- Bucket-Deklaration erfolgt sowohl in `supabase/config.toml` als
  auch in einer Migrations-SQL-Datei.

## Open Questions

Keine. Alle Unklarheiten wurden in der Research- und Verifikations-
Phase aufgelöst; die drei Abweichungen vom Ticket-Text (Sidebar-
Pfad, Attachment-Flow, QR-Service-Split) wurden explizit bestätigt.

## References

- Research: `thoughts/shared/research/2026-04-20-serviceobjekte-codebase-analyse.md`
- Reference-Entity Prisma-Muster:
  - `prisma/schema.prisma:465-533` (CrmAddress + AddressHierarchy)
  - `prisma/schema.prisma:1768-1794` (Department + DepartmentTree)
  - `prisma/schema.prisma:5139-5155` (WhArticleGroup + ArticleGroupTree)
  - `prisma/schema.prisma:5380-5413` (WhStockMovement mit machineId)
  - `prisma/schema.prisma:5731-5760` (HrPersonnelFileAttachment)
  - `prisma/schema.prisma:735-752` (CrmCorrespondenceAttachment)
- Reference-Services:
  - `src/lib/services/crm-correspondence-attachment-service.ts` (Attachment-Flow, Bucket, Signed-URL)
  - `src/lib/services/hr-personnel-file-attachment-service.ts` (Attachment-Triangulierung)
  - `src/lib/services/wh-qr-service.ts` (QR-Patterns, zu refaktoren)
  - `src/lib/pdf/qr-label-pdf.tsx` (QrLabelPdf-Reuse)
  - `src/lib/services/department-service.ts:46-65` (Cycle-Detection)
  - `src/lib/services/wh-article-group-service.ts:34-53` (Cycle-Detection Variant)
  - `src/lib/services/crm-address-service.ts:50-69, 424-432` (Type-Compat + Cycle)
  - `src/lib/services/payroll-bulk-import-service.ts` (CSV-Import-Pattern)
- Reference-Router:
  - `src/trpc/routers/crm/addresses.ts` (Router-Muster, crmProcedure)
  - `src/trpc/routers/warehouse/withdrawals.ts:24, 34-36, 63-65, 118-141` (referenceTypeEnum)
  - `src/trpc/routers/payrollBulkImport.ts` (Import-Router)
- Reference-UI:
  - `src/components/departments/department-tree-view.tsx` + `department-tree-node.tsx`
  - `src/components/warehouse/withdrawal-terminal.tsx:30, 42, 53-83, 107-111, 154-181, 199-203, 314-337`
  - `src/components/warehouse/qr-scanner.tsx:71, 191` (Scanner-Prefix)
  - `src/components/layout/sidebar/sidebar-nav-config.ts:384-417` (CRM-Section)
  - `src/app/[locale]/(dashboard)/admin/payroll-import/page.tsx` (Import-Wizard-UI)
- Reference-Migration:
  - `supabase/migrations/20260428000001_create_bank_statements_storage_bucket.sql` (Bucket-Migration)
  - `supabase/migrations/20260424000001_backfill_missing_storage_buckets.sql:66-99` (Bucket-SQL)
  - `supabase/migrations/20260503000000_create_overtime_requests.sql` (Pure-Terp-Migration)
- Reference-Module (pure-Terp):
  - Overtime-Requests auf `staging` — siehe Research §4.
