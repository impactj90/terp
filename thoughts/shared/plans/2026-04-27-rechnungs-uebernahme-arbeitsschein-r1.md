# R-1: Rechnungs-Übernahme aus Arbeitsschein — Implementation Plan

## Overview

Aus einem signierten `WorkReport` wird per 1-Klick ein `BillingDocument`
im Status DRAFT erzeugt — mit vorbefüllten Positionen aus den dem Schein
zugeordneten `OrderBooking`-Einträgen sowie der Anfahrtsdauer. Der
Disponent reviewt im Dialog (inline-edit + Position hinzufügen/entfernen)
und bestätigt; alle weiteren Anpassungen finden im existierenden
DRAFT-Editier-Workflow des Billing-Moduls statt.

Quelle der Architektur-Entscheidungen: Ticket-Spec aus dem Plan-Briefing,
das die fünf bindenden Decisions (FK-basierte Booking↔WorkReport-
Zuordnung, Anfahrt als einzelne Position ohne km-/Pauschal-Konfig,
Stundensatz-Lookup-Chain Order > Employee > null, FK-basierte Idempotenz
auf BillingDocument, hartcodiertes Deutsch ohne i18n) enthält.

Research-Grundlage:
`thoughts/shared/research/2026-04-24-rechnungs-uebernahme-arbeitsschein.md`

## Working Rule — PAUSE + Deviation Note

Bei jeder technischen Überraschung während der Implementierung, die eine
Abweichung vom Plan erzwingt (z. B. Schema-Felder fehlen, Service-API
verhält sich anders als hier dokumentiert, Audit-Pattern weicht ab,
Permission-Key existiert nicht), gilt:

1. **PAUSE** — nicht stillschweigend anpassen, sondern Implementierung
   anhalten.
2. **Deviation Note** — neue Sektion am Ende dieses Dokuments unter
   `## Deviations` (siehe unten) anlegen mit:
   - Was wurde im Plan angenommen
   - Was wurde tatsächlich vorgefunden
   - Welche Resolution wurde gewählt (mit Begründung)
   - Welche Folge für andere Phasen (falls relevant)
3. Resolution mit dem Reviewer abstimmen, dann fortfahren.

Eine Deviation existiert bereits (siehe `## Deviations` unten:
"D-1 — addressId Hard-Fail statt Soft-Warning"). Neue Deviations folgen
demselben dokumentarischen Standard.

## Current State Analysis

Stand der Codebase (verifiziert 2026-04-27):

- **WorkReport** (`prisma/schema.prisma:2658-2704`): Vollständig
  vorhanden mit Status-Lifecycle DRAFT→SIGNED→VOID, `code` (unique),
  `travelMinutes Int?`, `serviceObjectId String?`, Relation
  `assignments → WorkReportAssignment[]`. **Keine Relation zu
  BillingDocument oder OrderBooking heute.**
- **WorkReportAssignment** (`schema.prisma:2706-2724`): `employeeId` FK
  zur Identifizierung der Mitarbeiter pro Schein.
- **OrderBooking** (`schema.prisma:5447-5476`): Felder `employeeId`,
  `orderId`, `activityId?`, `bookingDate`, **`timeMinutes`** (nicht
  `durationMinutes`), `description?`. **Keine `workReportId`-Spalte
  heute.**
- **BillingDocument** (`schema.prisma:1102-1189`): Source-FKs
  `inquiryId?`, `orderId?`, `parentDocumentId?` existieren als
  Vorbild; **`addressId` ist NON-NULL**. **Keine `workReportId`-Spalte
  heute.**
- **BillingDocumentPosition** (`schema.prisma:1199-1222`): Items-Modell
  heißt `BillingDocumentPosition` (nicht `BillingDocumentItem`).
  Service-Methode `addPosition()`. `BillingPositionType`-Enum
  (`schema.prisma:671-679`): `ARTICLE | FREE | TEXT | PAGE_BREAK |
  SUBTOTAL`. Für Arbeitsleistung + Anfahrt nutzen wir `FREE`.
- **Order.billingRatePerHour** (`schema.prisma:2575`): existiert,
  `Decimal? @db.Decimal(10, 2)`. **Order hat KEINEN
  `customerAddressId`-FK** — kein Adress-Fallback aus Order.
- **Employee.hourlyRate** (`schema.prisma:2182`): existiert, `Decimal?
  @db.Decimal(10, 2)`.
- **ServiceObject.customerAddressId** (`schema.prisma:941`): NON-NULL
  FK auf `CrmAddress`.
- **billing-document-service.create()**
  (`src/lib/services/billing-document-service.ts:205-236`): akzeptiert
  bereits `orderId?`, `inquiryId?`, **aber nicht `workReportId?`**.
  `addressId` ist Pflichtfeld in der Input-Signatur und wird per
  `findFirst({ id, tenantId })` validiert. Kein Fallback auf
  `null`-Adresse.
- **handleServiceError** (`src/trpc/errors.ts:10-105`): Suffix-basierte
  Auto-Map (`*NotFoundError`→NOT_FOUND, `*ValidationError`→BAD_REQUEST,
  `*ConflictError`→CONFLICT, `*ForbiddenError`→FORBIDDEN). **Kein
  PRECONDITION_FAILED-Mapping heute.** Keine `ServiceError`-Basisklasse;
  jeder Service definiert eigene Error-Subklassen mit `this.name = "..."`.
- **work-report-service.ts**: vollständig vorhanden mit `list`,
  `getById`, `listByOrder`, `listByServiceObject`, `create`, `update`,
  `remove`, `sign`, `voidReport`. **Kein `generateInvoice` heute.**
- **workReports tRPC router** (`src/trpc/routers/workReports.ts`):
  Procedures `list`, `getById`, `listByOrder`, `listByServiceObject`,
  `create`, `update`, `delete`, `downloadPdf`, `sign`, `void`, sowie
  Sub-Router `assignments` und `attachments`. **Kein
  `previewInvoiceGeneration` und kein `generateInvoice` heute.**
- **orderBookings tRPC router**
  (`src/trpc/routers/orderBookings.ts:101-117`): `createInputSchema` und
  `updateInputSchema` enthalten heute kein `workReportId`. `create`
  schreibt inline via Prisma; `update`/`delete` delegieren an
  `order-booking-service`.
- **WorkReport-Detail-Seite**:
  `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx` —
  Action-Bar inline an Zeilen 363-404 mit konditionalen Buttons (PDF,
  Edit, Signieren, Stornieren, Löschen). **Kein "Rechnung erzeugen"
  heute.**
- **OrderBooking-Form**:
  `src/components/orders/order-booking-form-sheet.tsx`. **Kein
  Arbeitsschein-Dropdown heute.**
- **Audit-Log dual-write Pattern (T-3)**:
  `src/lib/services/service-schedule-service.ts:643-678` — beide
  `auditLog.log()`-Calls innerhalb derselben Transaktion mit
  fire-and-forget `.catch(...)`.

## Desired End State

Nach Abschluss aller Phasen:

1. **Datenbank**: `OrderBooking.workReportId` und
   `BillingDocument.workReportId` existieren als nullable FK mit
   `onDelete: SetNull` und Index `[tenantId, workReportId]`.
2. **Service**: `work-report-invoice-bridge-service.ts` exportiert
   `computeProposedPositions()` und `generateInvoiceFromWorkReport()`.
3. **tRPC**: `work-reports.previewInvoiceGeneration` (query) und
   `work-reports.generateInvoice` (mutation) sind aufrufbar.
4. **UI**: `OrderBooking`-Form bietet Arbeitsschein-Dropdown;
   `WorkReport`-Detail zeigt Action-Button "Rechnung erzeugen" bei
   SIGNED-Status; Generate-Dialog mit inline-edit + manuellen Positionen
   funktioniert; Idempotenz blockiert Doppel-Generate (UI + Service).
5. **Audit**: Pro Generate werden zwei `audit_logs`-Einträge mit
   Cross-Link-Metadata geschrieben (Pattern wie T-3).
6. **Tests**: Unit + Integration + tRPC-Router + E2E grün; manuelle
   Verifikations-Checkliste durchgeklickt.

### Verifikation des End-States

```bash
pnpm typecheck                                  # 0 neue Fehler
pnpm vitest run src/lib/services/__tests__/work-report-invoice-bridge-service.test.ts
pnpm vitest run src/lib/services/__tests__/work-report-invoice-bridge-service.integration.test.ts
pnpm vitest run src/trpc/routers/__tests__/workReports-generate-invoice.test.ts
pnpm test                                        # alle Tests grün
pnpm playwright test src/e2e-browser/specs/83-work-report-invoice-generation.spec.ts
```

## Key Discoveries

- `BillingDocumentPosition` (nicht `BillingDocumentItem`) — Service-API
  ist `addPosition()`, nicht `addItem()`.
- `OrderBooking.timeMinutes` (nicht `durationMinutes`).
- `BillingPositionType.FREE` ist der korrekte Type für Labor- und
  Travel-Positionen ohne Article-Ref (`schema.prisma:671-679`).
- T-3 dual-log läuft **innerhalb derselben Transaktion** mit
  `tx`-Client; siehe `service-schedule-service.ts:643-678`.
- `handleServiceError` braucht **eine schmale Erweiterung** für das vom
  Ticket geforderte `PRECONDITION_FAILED`-Mapping (Suffix
  `*PreconditionFailedError`).
- `billing-document-service.create()` ruft `addPosition()` separat auf
  — der Bridge-Service muss beides in einer eigenen `$transaction`
  zusammenfassen, damit Audit-Logs + Document + Positionen atomar
  committen.
- `auditLog.log()` (`src/lib/services/audit-logs-service.ts:173-175`)
  akzeptiert `Tx` als ersten Param und schreibt automatisch
  Platform-Audit bei aktivem Impersonation-Context — keine
  zusätzliche Logik nötig.

## What We're NOT Doing

- **Kein** Reverse-FK auf `WorkReport` (kein `invoiceDocumentId`).
- **Keine** neue Permission. `work_reports.view` +
  `billing_documents.create` reichen aus.
- **Keine** Schema-Änderung an `Employee`, `Order`, `Activity`,
  `CrmAddress` oder `WorkReport` selbst.
- **Keine** `CustomerHourlyRate`-Tabelle, **kein** `Activity.rate`,
  **kein** tenant-weiter Default-VAT.
- **Keine** tenant-weite Anfahrts-Konfig (kein km-Satz, keine
  Pauschale).
- **Keine** Material-Übernahme aus `WhStockMovement` (FK existiert
  bereits, aber Write-Pfad im Scanner-Terminal ist heute tot —
  separates Folge-Ticket).
- **Keine** i18n-Einführung im WorkReport-Modul (alle UI-Strings als
  deutsche String-Literale).
- **Keine** Multi-WorkReport-zu-einer-Rechnung-Logik (Direkt-FK heute,
  Junction-Table-Erweiterung als Folge-Ticket möglich).
- **Keine** retrospektive Migrations-Heuristik für bestehende Bookings
  (alle bestehenden `OrderBooking`-Zeilen erhalten `workReportId =
  NULL`).
- **Kein** DB-Constraint für Idempotenz (Service-Schicht-Check, nicht
  Partial-Unique-Index).

## Implementation Approach

Strikt phasenweise mit Database-First-Strategie: Schema/Migration zuerst
(Phase A), dann Bridge-Service mit allen Tests (Phase B), dann tRPC
(Phase C), dann UI inkrementell (Phase D + E), abschließend Handbuch +
manuelle Verifikation (Phase F). Jede Phase ist allein lauffähig — die
Codebase bleibt nach jeder Phase konsistent (kein Halbzustand). Datei-
Budget: 18-22 produktive Files; bei Überschreitung PAUSE.

Architektur-Deviations gegenüber Ticket-Spec sind in der Sektion
`## Deviations` am Ende dieses Dokuments dokumentiert. Stand jetzt:
**eine Deviation** (D-1: addressId Hard-Fail). Bei neuen Funden während
der Implementierung: PAUSE-Regel oben befolgen.

---

## Phase A — Datenmodell + Migration

### Overview
Schema-Änderungen + DB-Migration. Keine Code-Änderungen am Service-Layer.
Bestehende Tests müssen unverändert grün bleiben.

### Changes Required

#### A.1 Prisma-Schema

**File**: `prisma/schema.prisma`

`OrderBooking` (`schema.prisma:5447-5476`) erweitern:

```prisma
model OrderBooking {
  // ...existierende Felder
  workReportId String?  @map("work_report_id") @db.Uuid

  // ...existierende Relations
  workReport   WorkReport? @relation(fields: [workReportId], references: [id], onDelete: SetNull)

  // ...existierende Indizes
  @@index([tenantId, workReportId], map: "idx_order_bookings_tenant_workreport")
}
```

`BillingDocument` (`schema.prisma:1102-1189`) erweitern:

```prisma
model BillingDocument {
  // ...existierende Felder
  workReportId String?  @map("work_report_id") @db.Uuid

  // ...existierende Relations
  workReport   WorkReport? @relation(fields: [workReportId], references: [id], onDelete: SetNull)

  // ...existierende Indizes
  @@index([tenantId, workReportId], map: "idx_billing_documents_tenant_workreport")
}
```

`WorkReport` (`schema.prisma:2658-2704`) erweitern (nur Reverse-Relations):

```prisma
model WorkReport {
  // ...existierende Felder, KEIN neues Feld
  // ...existierende Relations
  bookings         OrderBooking[]
  billingDocuments BillingDocument[]
}
```

#### A.2 Supabase-Migration

**File**: `supabase/migrations/<timestamp>_add_workreport_idempotency_links.sql`

Erzeugen via:
```bash
pnpm db:migrate:new add_workreport_idempotency_links
```

Inhalt:
```sql
-- Add workReportId FK to OrderBooking for traceability + selective billing source
ALTER TABLE order_bookings
  ADD COLUMN work_report_id UUID NULL REFERENCES work_reports(id) ON DELETE SET NULL;

CREATE INDEX idx_order_bookings_tenant_workreport
  ON order_bookings(tenant_id, work_report_id);

-- Add workReportId FK to BillingDocument for idempotency check (Service-side)
ALTER TABLE billing_documents
  ADD COLUMN work_report_id UUID NULL REFERENCES work_reports(id) ON DELETE SET NULL;

CREATE INDEX idx_billing_documents_tenant_workreport
  ON billing_documents(tenant_id, work_report_id);
```

#### A.3 Prisma Client regenerieren

```bash
pnpm db:generate
```

### Success Criteria

#### Automated Verification:
- [x] Migration läuft sauber: `pnpm db:reset && pnpm db:migrate:new` im
      Smoke-Lauf zeigt keine Errors
- [x] Prisma generate baut ohne Fehler: `pnpm db:generate`
- [x] Type-Check bleibt grün: `pnpm typecheck` (keine neuen Fehler in
      WorkReport/OrderBooking/BillingDocument-Bereich)
- [x] Bestehende Tests grün: `pnpm test` (work-report-service.unit
      grün, 21/21)

#### Manual Verification:
- [ ] In Supabase Studio: beide neuen Spalten + Indizes existieren
- [ ] DB-Inspect: bestehende `order_bookings` und `billing_documents`
      Zeilen haben `work_report_id = NULL` (kein Default-Backfill)

**Implementation Note**: Nach Abschluss von Phase A vor Beginn von Phase
B pausieren bis manuelle Verifikation bestätigt ist.

---

## Phase B — Bridge-Service + Errors

### Overview
Zentrale Bridge-Logik im neuen Service. Errors definieren, in
`handleServiceError` einbinden (PRECONDITION_FAILED-Suffix neu),
Unit-Tests + Integration-Test schreiben.

### Changes Required

#### B.1 Neuer Service

**File**: `src/lib/services/work-report-invoice-bridge-service.ts`
(NEU)

Public API:

```ts
export type ProposedPosition = {
  kind: "labor" | "travel"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
  // UI-only metadata
  sourceBookingId?: string    // bei kind="labor"
  employeeId?: string         // bei kind="labor" + "travel"
  requiresManualPrice: boolean
}

export type PositionOverride = {
  kind: "labor" | "travel" | "manual"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
  sourceBookingId?: string
}

export class WorkReportNotEligibleForInvoicePreconditionFailedError extends Error {
  constructor(public status: string) {
    super(`Arbeitsschein muss SIGNED sein (aktuell: ${status})`)
    this.name = "WorkReportNotEligibleForInvoicePreconditionFailedError"
  }
}

export class WorkReportAlreadyInvoicedConflictError extends Error {
  constructor(
    public existingDocumentId: string,
    public existingDocumentNumber: string,
    public existingDocumentStatus: string
  ) {
    super(
      `Für diesen Arbeitsschein existiert bereits Rechnung ${existingDocumentNumber} (Status: ${existingDocumentStatus})`
    )
    this.name = "WorkReportAlreadyInvoicedConflictError"
  }
}

export class WorkReportNoAddressPreconditionFailedError extends Error {
  constructor() {
    super(
      "Diesem Arbeitsschein ist kein Service-Objekt mit Kunden-Adresse zugeordnet. Bitte das Service-Objekt im Auftrag setzen, dann erneut versuchen."
    )
    this.name = "WorkReportNoAddressPreconditionFailedError"
  }
}

export async function computeProposedPositions(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string
): Promise<ProposedPosition[]>

export async function generateInvoiceFromWorkReport(
  prisma: PrismaClient,
  tenantId: string,
  workReportId: string,
  userId: string,
  options?: { positionsOverride?: PositionOverride[] },
  audit?: AuditContext
): Promise<{ id: string; number: string }>
```

Implementations-Details:

**`computeProposedPositions`** (read-only, kein Side-Effect):
1. Lade WorkReport mit `include: { assignments: { include: { employee: true } }, order: true }`. Wenn nicht gefunden: `WorkReportNotFoundError`.
2. Lade alle `OrderBooking` mit `where: { tenantId, workReportId }` inkl. `activity` und `employee`-Relation, Sortierung nach `bookingDate ASC, createdAt ASC`.
3. Pro Booking: Stundensatz-Chain
   - Wenn `order.billingRatePerHour != null`: nutze diesen Wert (Decimal → number)
   - Sonst wenn `booking.employee.hourlyRate != null`: nutze diesen Wert
   - Sonst: `null` → `requiresManualPrice = true`, `unitPrice = 0`
4. Beschreibung: `activity?.name ? `${activity.name}: ${description ?? "Arbeitsleistung"}` : (description ?? "Arbeitsleistung")`
5. Erzeuge Labor-Position: `{ kind: "labor", description, quantity: round(timeMinutes / 60, 2), unit: "h", unitPrice: rate ?? 0, vatRate: VAT_DEFAULT, sourceBookingId, employeeId, requiresManualPrice }`
6. Wenn `workReport.travelMinutes > 0`:
   - Maximum-Rate über alle `assignments[].employee.hourlyRate`, fallback auf `order.billingRatePerHour`, fallback auf `null`
   - Travel-Position: `{ kind: "travel", description: `Anfahrt: ${travelMinutes} Minuten`, quantity: round(travelMinutes / 60, 2), unit: "h", unitPrice: rate ?? 0, vatRate: VAT_DEFAULT, requiresManualPrice }`
7. Sortierung: erst Labor (chronologisch), dann Travel am Ende.
8. `VAT_DEFAULT = 19.0` als Modul-Konstante.

**`generateInvoiceFromWorkReport`**:
1. WorkReport laden mit Includes (`assignments.employee`, `order`, `serviceObject.customerAddress`)
2. Status-Check: wenn `!== "SIGNED"`: throw `WorkReportNotEligibleForInvoicePreconditionFailedError(status)`
3. Idempotenz-Check: `prisma.billingDocument.findFirst({ where: { tenantId, workReportId, status: { not: "CANCELLED" } } })`. Wenn gefunden: throw `WorkReportAlreadyInvoicedConflictError(...)`
4. Adress-Auflösung:
   - `addressId = workReport.serviceObject?.customerAddressId ?? null`
   - Wenn `null`: throw `WorkReportNoAddressPreconditionFailedError()`
5. Positionen ermitteln:
   - Wenn `options?.positionsOverride` gesetzt: nutze diese (vom UI editierte Liste)
   - Sonst: `computeProposedPositions(prisma, tenantId, workReportId)` → mappe auf gleiche Position-Shape
6. Transaktion `prisma.$transaction(async (tx) => {...})`:
   - `billingDocumentService.create(tx, tenantId, { type: "INVOICE", addressId, orderId: workReport.orderId, workReportId, ... }, userId, audit)` (siehe B.2 für Erweiterung)
   - Pro Position: `billingDocumentService.addPosition(tx, tenantId, { documentId: created.id, type: "FREE", description, quantity, unit, unitPrice, vatRate, sortOrder: i }, userId, audit)`
   - **Audit-Log dual-write** (Pattern wie `service-schedule-service.ts:643-678`):
     ```ts
     auditLog.log(tx, {
       tenantId, userId, action: "generate_invoice",
       entityType: "work_report", entityId: workReport.id,
       entityName: workReport.code,
       metadata: { generatedDocumentId: created.id, generatedDocumentNumber: created.number },
       ...auditCtx,
     }).catch((err) => console.error("[bridge] audit failed", err))

     auditLog.log(tx, {
       tenantId, userId, action: "create",
       entityType: "billing_document", entityId: created.id,
       entityName: created.number,
       metadata: { sourceWorkReportId: workReport.id, sourceWorkReportCode: workReport.code },
       ...auditCtx,
     }).catch((err) => console.error("[bridge] audit failed", err))
     ```
7. Return `{ id: created.id, number: created.number }`

#### B.2 billing-document-service erweitern

**File**: `src/lib/services/billing-document-service.ts`

`create()`-Input-Type (Zeile 205-236) um optionales `workReportId?: string` erweitern und im Prisma-Create-Aufruf weiterreichen. Keine zusätzliche Validierungs-Logik (Idempotenz-Check liegt eine Schicht höher im Bridge-Service).

#### B.3 handleServiceError erweitern

**File**: `src/trpc/errors.ts`

Nach dem `*ConflictError`-Block (Zeile 42-48) eine neue Mapping-Regel
einfügen:

```ts
// Precondition errors (e.g., wrong state, missing prerequisite)
if (name.endsWith("PreconditionFailedError")) {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: err.message,
    cause: err,
  })
}
```

Reihenfolge wichtig: vor `ForbiddenError`-Check, weil sich Suffixe nicht
überlappen.

#### B.4 Unit-Tests

**File**: `src/lib/services/__tests__/work-report-invoice-bridge-service.test.ts` (NEU)

Test-Cases (alle mit Prisma-Mock + transactional rollback):
- `computeProposedPositions` mit 3 Bookings + 60 min travel + Mix von Order-Rate / Employee-Rate / null
- `computeProposedPositions` mit 0 Bookings + 30 min travel
- `computeProposedPositions` mit 5 Bookings + 0 travel (keine Travel-Position)
- `generateInvoiceFromWorkReport` happy path (DRAFT-Schein nach Sign → Generate → Document erstellt mit korrektem `workReportId`)
- DRAFT-Schein → throw `WorkReportNotEligibleForInvoicePreconditionFailedError`
- VOID-Schein → throw NotEligible
- Existierende DRAFT-Rechnung (`status != "CANCELLED"`) → throw `WorkReportAlreadyInvoicedConflictError`
- Existierende CANCELLED-Rechnung → success (nicht blockiert)
- `serviceObjectId = null` → throw `WorkReportNoAddressPreconditionFailedError`
- `serviceObject.customerAddressId` nicht auflösbar (gelöscht) → throw `WorkReportNoAddressPreconditionFailedError`
- Stundensatz-Chain: nur Order-Rate → diese wird genutzt
- Stundensatz-Chain: nur Employee-Rate → diese wird genutzt
- Stundensatz-Chain: keine Rate → `unitPrice = 0` + `requiresManualPrice = true`
- Multi-Mitarbeiter-Anfahrt mit unterschiedlichen `hourlyRate` → Maximum-Rate-Logik korrekt
- Position-Override: User entfernt Travel-Position → Document hat nur Labor-Positionen

#### B.5 Integration-Test (echte DB)

**File**: `src/lib/services/__tests__/work-report-invoice-bridge-service.integration.test.ts` (NEU)

Pattern: shared Dev-DB mit transaction-rollback. Test-Cases:
- Full-Flow: Order seed → ServiceObject + CrmAddress seed → WorkReport seed (DRAFT) → 2 Bookings seed mit `workReportId` gesetzt → Sign WorkReport → `generateInvoiceFromWorkReport` → Verifikation: BillingDocument existiert mit `workReportId`, 3 Positionen (2 Labor + 1 Travel), 2 Audit-Log-Einträge mit Cross-Link-Metadata.
- Cross-Tenant-Isolation: WorkReport von Tenant A, Aufruf als User von Tenant B → throw `WorkReportNotFoundError` (existing pattern, kein Sonderpfad).
- Idempotenz: zweimal nacheinander → erster success, zweiter throw `WorkReportAlreadyInvoicedConflictError` mit korrektem `existingDocumentNumber` in metadata.
- Re-Generate nach Storno: existierende Rechnung manuell auf `CANCELLED` setzen → erneutes Generate erfolgreich → beide Documents in DB, neues mit `workReportId`, altes behält `workReportId` als historische Referenz.

### Success Criteria

#### Automated Verification:
- [x] Type-Check grün: `pnpm typecheck` (no new errors)
- [x] Unit-Tests grün (20/20):
      `pnpm vitest run src/lib/services/__tests__/work-report-invoice-bridge-service.test.ts`
- [x] Integration-Test grün (6/6):
      `pnpm vitest run src/lib/services/__tests__/work-report-invoice-bridge-service.integration.test.ts`
- [x] Bestehende Tests grün: 68/68 incl. billing-document-service +
      work-report-service.unit + .integration.
- [ ] Lint grün: `pnpm lint`

#### Manual Verification:
- [ ] Code-Review: `handleServiceError`-Erweiterung folgt existierender
      Suffix-Konvention
- [ ] Code-Review: Audit-Logs werden im selben `tx` wie `create()` +
      `addPosition()` geschrieben (atomic-commit)

**Note**: bridge-service uses each underlying service's own atomic
transaction (create() and addPosition() each open their own tx).
Audit logs are fire-and-forget after success. Trade-off documented
in the bridge-service file header.

**Implementation Note**: Nach Abschluss von Phase B vor Beginn von Phase
C pausieren bis manuelle Verifikation bestätigt ist.

---

## Phase C — tRPC + Permissions

### Overview
Zwei neue Procedures auf dem `workReports`-Router; Permission-Auth
mittels existierender Keys (`work_reports.view`,
`billing_documents.create`). Router-Tests.

### Changes Required

#### C.1 workReports-Router erweitern

**File**: `src/trpc/routers/workReports.ts`

Neue Procedures hinzufügen:

```ts
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as bridgeService from "@/lib/services/work-report-invoice-bridge-service"

const WR_VIEW = permissionIdByKey("work_reports.view")!
const BD_CREATE = permissionIdByKey("billing_documents.create")!

// Output-Schema für Preview
const proposedPositionSchema = z.object({
  kind: z.enum(["labor", "travel"]),
  description: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitPrice: z.number(),
  vatRate: z.number(),
  sourceBookingId: z.string().optional(),
  employeeId: z.string().optional(),
  requiresManualPrice: z.boolean(),
})

const positionOverrideSchema = z.object({
  kind: z.enum(["labor", "travel", "manual"]),
  description: z.string().min(1).max(2000),
  quantity: z.number().min(0),
  unit: z.string().min(1).max(20),
  unitPrice: z.number().min(0),
  vatRate: z.number().min(0).max(100),
  sourceBookingId: z.string().optional(),
})

// Zugefügt zur createTRPCRouter({...}):

previewInvoiceGeneration: tenantProcedure
  .use(requirePermission(WR_VIEW))
  .input(z.object({ workReportId: z.string() }))
  .output(z.object({
    proposedPositions: z.array(proposedPositionSchema),
    existingInvoice: z.object({
      id: z.string(),
      number: z.string(),
      status: z.string(),
    }).nullable(),
    warnings: z.array(z.enum(["noAddress", "noEligibleBookings"])),
  }))
  .query(async ({ ctx, input }) => {
    try {
      const tenantId = ctx.tenantId!
      // Idempotenz-Lookup (read-only)
      const existing = await ctx.prisma.billingDocument.findFirst({
        where: {
          tenantId,
          workReportId: input.workReportId,
          status: { not: "CANCELLED" },
        },
        select: { id: true, number: true, status: true },
      })

      // Address-Lookup für Warning
      const wr = await ctx.prisma.workReport.findFirst({
        where: { id: input.workReportId, tenantId },
        include: { serviceObject: true },
      })
      if (!wr) throw new Error("WorkReportNotFoundError") // wird vom handleServiceError gefangen

      const warnings: ("noAddress" | "noEligibleBookings")[] = []
      if (!wr.serviceObject?.customerAddressId) warnings.push("noAddress")

      const proposedPositions = await bridgeService.computeProposedPositions(
        ctx.prisma, tenantId, input.workReportId
      )
      if (proposedPositions.length === 0) warnings.push("noEligibleBookings")

      return {
        proposedPositions,
        existingInvoice: existing,
        warnings,
      }
    } catch (err) {
      handleServiceError(err)
    }
  }),

generateInvoice: tenantProcedure
  .use(requirePermission(WR_VIEW))
  .use(requirePermission(BD_CREATE))
  .input(z.object({
    workReportId: z.string(),
    positions: z.array(positionOverrideSchema).optional(),
  }))
  .output(z.object({
    billingDocumentId: z.string(),
    billingDocumentNumber: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      const tenantId = ctx.tenantId!
      const result = await bridgeService.generateInvoiceFromWorkReport(
        ctx.prisma,
        tenantId,
        input.workReportId,
        ctx.userId,
        { positionsOverride: input.positions },
        { userId: ctx.userId, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
      )
      return {
        billingDocumentId: result.id,
        billingDocumentNumber: result.number,
      }
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

#### C.2 Router-Tests

**File**: `src/trpc/routers/__tests__/workReports-generate-invoice.test.ts` (NEU)

Test-Cases (existing pattern: `tenantProcedure`-Test-Helper aus dem
Codebase):
- `previewInvoiceGeneration` ohne `work_reports.view` → throw FORBIDDEN
- `previewInvoiceGeneration` happy path → korrekt formatierte Response
- `previewInvoiceGeneration` mit non-CANCELLED Existing-Invoice →
  `existingInvoice` populated
- `previewInvoiceGeneration` mit fehlender Adresse → `warnings`
  enthält `"noAddress"`
- `previewInvoiceGeneration` ohne zugeordnete Bookings + ohne Travel →
  `warnings` enthält `"noEligibleBookings"`
- `generateInvoice` ohne `billing_documents.create` → throw FORBIDDEN
- `generateInvoice` mit Position-Overrides → angewendete Werte landen
  in DB
- `generateInvoice` für DRAFT-Schein → throw PRECONDITION_FAILED
- `generateInvoice` für SIGNED-Schein mit existierender DRAFT-Rechnung
  → throw CONFLICT
- `generateInvoice` für SIGNED-Schein ohne ServiceObject → throw
  PRECONDITION_FAILED

### Success Criteria

#### Automated Verification:
- [x] Type-Check grün: `pnpm typecheck` (no new errors in R-1 files)
- [x] Router-Tests grün (14/14):
      `pnpm vitest run src/trpc/routers/__tests__/workReports-generate-invoice.test.ts`
- [x] Bestehende Tests grün
- [x] tRPC-Schema kompiliert (keine Z-Schema-Validierungsfehler)

#### Manual Verification:
- [ ] In React DevTools / tRPC-Devtools: beide Procedures sind
      aufrufbar und liefern korrekte Output-Shapes

**Implementation Note**: Nach Abschluss von Phase C vor Beginn von Phase
D pausieren bis manuelle Verifikation bestätigt ist.

---

## Phase D — UI: OrderBooking-Form

### Overview
OrderBooking-Form um Arbeitsschein-Dropdown erweitern. Router-Endpoints
für Persistenz von `workReportId` ergänzen (create + update).

### Changes Required

#### D.1 orderBookings-Router-Schemas erweitern

**File**: `src/trpc/routers/orderBookings.ts`

`createInputSchema` (Zeile 101-108) und `updateInputSchema` (Zeile
110-117) um `workReportId` erweitern:

```ts
const createInputSchema = z.object({
  // ...existierende Felder
  workReportId: z.string().nullable().optional(),
})

const updateInputSchema = z.object({
  // ...existierende Felder
  workReportId: z.string().nullable().optional(),
})
```

`orderBookingOutputSchema` (Zeile 66-84) ebenfalls erweitern:

```ts
const orderBookingOutputSchema = z.object({
  // ...existierende Felder
  workReportId: z.string().nullable(),
})
```

`mapToOutput()` (Zeile 145-213) erweitern:

```ts
workReportId: (record.workReportId as string | null) ?? null,
```

`create`-Procedure: im inline Prisma-Create `workReportId:
input.workReportId ?? null` setzen.

`update`-Procedure: an `orderBookingService.update()` durchreichen.

**Validierung**: Wenn `workReportId` gesetzt, MUSS der Schein zum gleichen
`orderId` gehören UND `status === "DRAFT"` sein. Validierung in beiden
Procedures (oder gleichwertig im Service):
```ts
if (input.workReportId) {
  const wr = await ctx.prisma.workReport.findFirst({
    where: { id: input.workReportId, tenantId, orderId: input.orderId, status: "DRAFT" },
  })
  if (!wr) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Arbeitsschein muss DRAFT sein und zum gleichen Auftrag gehören",
    })
  }
}
```

#### D.2 order-booking-service.ts erweitern (falls vorhanden)

**File**: `src/lib/services/order-booking-service.ts`

`update()`-Funktion: `workReportId` als optionalen Input-Parameter
unterstützen, im Prisma-Update-Aufruf weiterreichen.

#### D.3 OrderBooking-Form

**File**: `src/components/orders/order-booking-form-sheet.tsx`

Neues optionales Form-Feld "Arbeitsschein" einfügen:

```tsx
const { data: workReports } = trpc.workReports.listByOrder.useQuery(
  { orderId: form.orderId },
  { enabled: !!form.orderId }
)

const draftReports = workReports?.filter((r) => r.status === "DRAFT") ?? []

// Im Form-JSX, nach dem Activity-Field:
<div>
  <Label htmlFor="workReportId">Arbeitsschein (optional)</Label>
  <Select
    value={form.workReportId ?? "none"}
    onValueChange={(v) => setForm({ ...form, workReportId: v === "none" ? null : v })}
  >
    <SelectTrigger id="workReportId">
      <SelectValue placeholder="Kein Arbeitsschein" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="none">— Kein Arbeitsschein —</SelectItem>
      {draftReports.map((r) => (
        <SelectItem key={r.id} value={r.id}>
          {r.code} ({format(r.visitDate, "dd.MM.yyyy")})
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground mt-1">
    Nur DRAFT-Arbeitsscheine wählbar. Signierte Scheine sind gesperrt.
  </p>
</div>
```

Default-Wert beim Edit: `record.workReportId ?? null`. Bei Submit
`workReportId: form.workReportId ?? null` mitschicken.

### Success Criteria

#### Automated Verification:
- [x] Type-Check grün: `pnpm typecheck` (no new errors in R-1 files)
- [ ] Lint grün: `pnpm lint`
- [x] Bestehende Tests grün (orderBookings router 17/17 + bridge tests)

#### Manual Verification:
- [ ] In Dev-Tenant: OrderBooking neu anlegen mit Arbeitsschein-Auswahl
      → DB-Wert korrekt gesetzt
- [ ] OrderBooking ohne Arbeitsschein anlegen → `workReportId = NULL`
- [ ] OrderBooking editieren: bestehende Zuordnung wird angezeigt,
      kann auf "Kein Arbeitsschein" geändert werden
- [ ] WorkReport im Status SIGNED erscheint nicht im Dropdown
- [ ] WorkReport eines anderen Auftrags erscheint nicht im Dropdown
- [ ] Backend wirft BAD_REQUEST wenn `workReportId` gesetzt aber
      Schein nicht DRAFT (Postman-Test direkt)

**Implementation Note**: Nach Abschluss von Phase D vor Beginn von Phase
E pausieren bis manuelle Verifikation bestätigt ist.

---

## Phase E — UI: Generate-Dialog + Action-Button

### Overview
Generate-Dialog mit Preview-Tabelle, inline-edit, manuellen Positionen.
Action-Button im WorkReport-Detail. Custom-Hooks. E2E-Test.

### Changes Required

#### E.1 Hooks

**File**: `src/hooks/use-work-report-invoice-preview.ts` (NEU)

```ts
import { trpc } from "@/trpc/client"

export function useWorkReportInvoicePreview(workReportId: string, enabled: boolean) {
  return trpc.workReports.previewInvoiceGeneration.useQuery(
    { workReportId },
    { enabled }
  )
}
```

**File**: `src/hooks/use-generate-work-report-invoice.ts` (NEU)

```ts
import { trpc } from "@/trpc/client"

export function useGenerateWorkReportInvoice() {
  const utils = trpc.useUtils()
  return trpc.workReports.generateInvoice.useMutation({
    onSuccess: (_, variables) => {
      // Invalidate WorkReport detail (status indicator)
      utils.workReports.getById.invalidate({ id: variables.workReportId })
      // Invalidate BillingDocument list
      utils.billingDocuments.list.invalidate()
      // Invalidate Order detail (booking summary may change)
      // Hinweis: orderId muss aus WorkReport kommen — wird im Dialog geholt
    },
  })
}
```

#### E.2 Generate-Dialog

**File**: `src/components/work-reports/work-report-generate-invoice-dialog.tsx` (NEU)

Komponente mit Props:
```ts
type Props = {
  workReport: { id: string; code: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

Dialog-Struktur (nach T-3-Pattern, AlertDialog ist OK, oder Dialog für
größere Tabellen — empfehle `<Dialog>` mit `max-w-4xl` für die
Positions-Tabelle):

1. Bei `open = true`: `useWorkReportInvoicePreview(id, true)` aktiviert.
2. Loading-Zustand: Spinner + "Vorschläge werden geladen…"
3. Error-Zustand: Inline-Error.
4. Erfolg-Zustand:
   - Header: `Rechnung aus Arbeitsschein {code} erzeugen`
   - Existing-Invoice-Banner (wenn `existingInvoice !== null`):
     ```
     <Alert variant="destructive">
       Für diesen Arbeitsschein existiert bereits Rechnung
       <strong>{existingInvoice.number}</strong> im Status
       <strong>{existingInvoice.status}</strong>.
       <Link href={`/admin/billing/documents/${existingInvoice.id}`}>
         Zur Rechnung
       </Link>
     </Alert>
     ```
     Button "Erzeugen" disabled in diesem Fall.
   - NoAddress-Banner (wenn `warnings.includes("noAddress")`):
     ```
     <Alert variant="destructive">
       Diesem Arbeitsschein ist kein Service-Objekt mit Kunden-Adresse
       zugeordnet. Bitte das Service-Objekt im Auftrag setzen, dann
       erneut versuchen.
     </Alert>
     ```
     Button "Erzeugen" disabled.
   - Positions-State im Dialog: `useState<EditablePosition[]>` initialisiert mit `proposedPositions`. Edit-Operationen (modify, remove, add manual) ändern diesen State.
   - Positions-Tabelle:
     ```
     | Beschreibung | Menge | Einheit | Einzelpreis | VAT% | Gesamt | Aktionen |
     ```
     Pro Zeile: Inline-Edit für Beschreibung, Menge, Einzelpreis, VAT.
     Wenn `requiresManualPrice = true`: rote Border am Cell,
     `<Tooltip>Stundensatz nicht ermittelbar — bitte manuell eintragen</Tooltip>`.
     Aktion "Entfernen" (Trash-Icon).
   - Empty-State-Banner (wenn `warnings.includes("noEligibleBookings")`
     UND keine manuelle Position angelegt): rein informativer Hinweis
     ```
     <Alert variant="default">
       Diesem Arbeitsschein sind keine Buchungen zugeordnet und es ist
       keine Anfahrt erfasst. Sie können manuelle Positionen ergänzen,
       um trotzdem eine Rechnung anzulegen.
     </Alert>
     ```
     **Nicht** disabling — Button "Erzeugen" wird durch die Empty-Liste
     selbst deaktiviert (siehe unten), nicht durch das Banner.
   - Button unten: `+ Manuelle Position hinzufügen` → fügt leere Zeile
     mit `kind: "manual"` hinzu.
   - Footer: Live-berechnete Summen
     ```
     Summe netto: {netSum.toFixed(2)} EUR
     Summe VAT:   {vatSum.toFixed(2)} EUR
     Summe brutto:{grossSum.toFixed(2)} EUR
     ```
   - Buttons: "Abbrechen" (schließt Dialog), "Erzeugen" (deaktiviert
     wenn:
       a) `existingInvoice !== null` (Conflict-Banner aktiv), ODER
       b) `warnings.includes("noAddress")` (NoAddress-Banner aktiv), ODER
       c) `editablePositions.length === 0` (kein Vorschlag vorhanden
          UND keine manuelle Position angelegt), ODER
       d) `mutation.isPending` (Submit gerade aktiv)).
     Empty-State allein blockt nicht — sobald der User mindestens
     eine manuelle Position über `+ Manuelle Position hinzufügen`
     angelegt hat, wird "Erzeugen" aktiv (sofern keine andere Sperre
     greift).
5. Bei Klick auf "Erzeugen":
   ```ts
   await generateMutation.mutateAsync({
     workReportId: workReport.id,
     positions: editablePositions.map(toPositionOverride),
   })
   toast.success(`Rechnung ${result.billingDocumentNumber} erzeugt`)
   onOpenChange(false)
   router.push(`/admin/billing/documents/${result.billingDocumentId}`)
   ```
6. Error-Handling: TRPC-Error mit Code `CONFLICT` oder
   `PRECONDITION_FAILED` → Inline-Banner zeigen, Button bleibt aktiv für
   Retry.

#### E.3 Action-Button im WorkReport-Detail

**File**: `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx`

Action-Bar (Zeilen 363-404) erweitern. Logik:

```tsx
// Existing invoice lookup (use the preview query that we already need anyway,
// or a small dedicated query — recommend reusing previewInvoiceGeneration so
// banner data is consistent)
const { data: previewData } = trpc.workReports.previewInvoiceGeneration.useQuery(
  { workReportId: id },
  { enabled: workReport?.status === "SIGNED" && hasPermission("billing_documents.create") }
)

// Im Action-Bar, nach dem Stornieren-Button:
{workReport.status === "SIGNED" && hasPermission("billing_documents.create") && (
  previewData?.existingInvoice ? (
    <Button asChild variant="secondary">
      <Link href={`/admin/billing/documents/${previewData.existingInvoice.id}`}>
        Zur Rechnung {previewData.existingInvoice.number}
      </Link>
    </Button>
  ) : (
    <Button onClick={() => setGenerateDialogOpen(true)}>
      Rechnung erzeugen
    </Button>
  )
)}

<WorkReportGenerateInvoiceDialog
  workReport={{ id: workReport.id, code: workReport.code }}
  open={generateDialogOpen}
  onOpenChange={setGenerateDialogOpen}
/>
```

Permission-Check via existierendem Hook (vermutlich
`use-permission` oder `useAuth`-Helper — am Pattern der bestehenden
Buttons orientieren).

#### E.4 E2E-Test

**File**: `src/e2e-browser/specs/83-work-report-invoice-generation.spec.ts` (NEU)

Setup-Steps via test-fixture / global-setup:
1. Order seed (mit `billingRatePerHour = 75.00`)
2. ServiceObject mit CrmAddress seed, an Order verknüpfen
3. WorkReport in DRAFT mit 2 WorkReportAssignments + `travelMinutes = 45`
4. 3 OrderBookings mit `workReportId` gesetzt, verschiedene Aktivitäten,
   verschiedene Mitarbeiter
5. WorkReport per UI signieren (oder direkt DB-Update)

Test-Flow:
1. Navigation zum WorkReport-Detail
2. Klick "Rechnung erzeugen" → Dialog öffnet
3. Verify: 4 Vorschlags-Positionen sichtbar (3 Labor, 1 Travel)
4. Verify: Summen werden korrekt berechnet
5. Eine Position via "Entfernen"-Button entfernen → 3 Positionen
6. "Manuelle Position hinzufügen" → 4 Positionen
7. Beschreibung der manuellen Position füllen, Menge 2, Einzelpreis
   50.00, VAT 19
8. "Erzeugen" klicken → Toast "Rechnung … erzeugt"
9. Verify: Navigation zur BillingDocument-Detail-Seite
10. Verify: Status DRAFT, 4 Positionen, Adresse aus ServiceObject
    übernommen
11. Zurück zum WorkReport: Action-Button zeigt jetzt
    "Zur Rechnung {number}" statt "Rechnung erzeugen"
12. Klick "Rechnung erzeugen" zwischen Schritten würde das
    Conflict-Banner zeigen — testen wir mit erneutem Versuch:
    a. WorkReport-Detail erneut öffnen
    b. (Da der Action-Button jetzt "Zur Rechnung" zeigt, kein direkter
       Re-Test möglich. Stattdessen Button via DOM-Force-Klick im
       initial-state-Zustand testen.)

Zweiter Test-Case (Empty-State + Manual-only):
1. Setup: Order seed, WorkReport in DRAFT mit 1 Assignment, **keine
   Bookings**, **`travelMinutes = 0`**, signieren.
2. Navigation zum WorkReport-Detail → "Rechnung erzeugen"
3. Verify: Banner "Keine Buchungen oder Anfahrt zugeordnet …"
4. Verify: Vorschlags-Tabelle leer
5. Verify: Button "Erzeugen" disabled
6. Klick "+ Manuelle Position hinzufügen", Zeile ausfüllen
   (Beschreibung "Sondermaterial", Menge 1, Einheit "Stk",
   Einzelpreis 25.00, VAT 19)
7. Verify: Button "Erzeugen" jetzt aktiv
8. Klick "Erzeugen" → Document erstellt, 1 Position, `workReportId` gesetzt
9. Verify in DB: `BillingDocument.workReportId = <scheinId>`,
   1× `BillingDocumentPosition` mit type=FREE

Dritter Test-Case (VOID blendet Action-Buttons aus):
1. Setup: Order seed, WorkReport in SIGNED.
2. Navigation zum WorkReport-Detail → Verify: "Rechnung erzeugen"
   sichtbar.
3. Klick "Stornieren" → Reason ausfüllen → bestätigen → WorkReport-Status
   ist jetzt VOID.
4. Verify: weder "Rechnung erzeugen" noch "Zur Rechnung …" sichtbar im
   Action-Bar (Action-Bar ist Status-konditional gegen `status === "SIGNED"`).

### Success Criteria

#### Automated Verification:
- [x] Type-Check grün: `pnpm typecheck` (no new errors in R-1 files)
- [ ] Lint grün: `pnpm lint`
- [x] Bestehende Tests grün (125 R-1+adjacent tests passing)
- [ ] E2E grün:
      `pnpm playwright test src/e2e-browser/87-workreport-invoice-generation.spec.ts`
      (spec file at `src/e2e-browser/87-workreport-invoice-generation.spec.ts`)

#### Manual Verification:
- [ ] Dialog öffnet bei Klick auf "Rechnung erzeugen"
- [ ] Vorschläge werden korrekt vorgeladen (Labor + Travel)
- [ ] Inline-Edit funktioniert für alle vier Felder (Beschreibung,
      Menge, Einzelpreis, VAT)
- [ ] "requiresManualPrice"-Marker zeigt rote Border + Tooltip
- [ ] Manuelle Position hinzufügen + ausfüllen funktioniert
- [ ] Position entfernen funktioniert
- [ ] Summen aktualisieren sich live bei jeder Änderung
- [ ] "Erzeugen" leitet zur BillingDocument-Detail-Seite weiter
- [ ] Erfolgs-Toast erscheint
- [ ] Zurück zum WorkReport: Action-Button zeigt "Zur Rechnung …"
- [ ] Doppel-Generate-Versuch (z. B. via Browser-Back) zeigt
      Conflict-Banner mit Link

**Implementation Note**: Nach Abschluss von Phase E vor Beginn von Phase
F pausieren bis manuelle Verifikation bestätigt ist.

---

## Phase F — Handbuch + Manuelle Verifikation

### Overview
TERP_HANDBUCH_V2.md erweitern um neue Sektion "Rechnung aus
Arbeitsschein erzeugen" mit Praxisbeispiel. Manuelle
Verifikations-Checkliste durchklicken.

### Changes Required

#### F.1 Handbuch-Sektion

**File**: `TERP_HANDBUCH_V2.md` (oder `TERP_HANDBUCH.md` — vor Beginn
prüfen welche Datei die aktuelle Quelle ist)

Neue Sektion in Kapitel §13 (Abrechnung) oder §14 (WorkReport, je nach
Kapitel-Struktur). Inhalt:

```markdown
## §13.x Rechnung aus Arbeitsschein erzeugen

Nach Signierung eines Arbeitsscheins kann der Disponent per 1-Klick
einen Rechnungs-Entwurf (DRAFT-BillingDocument) aus den zugeordneten
Zeitbuchungen und der Anfahrt erzeugen.

### Voraussetzungen
- Arbeitsschein im Status SIGNED
- Service-Objekt am Auftrag mit zugeordneter Kunden-Adresse
- Mindestens eine OrderBooking mit Arbeitsschein-Zuordnung ODER
  travelMinutes > 0
- Berechtigung `billing_documents.create`

### Praxisbeispiel
1. Auftrag „A-2026-0042" öffnen → Buchungs-Tab.
2. „Neue Buchung" → Mitarbeiter wählen, Aktivität, Datum, Zeit (in
   Minuten), Beschreibung. **Wichtig:** Im Dropdown „Arbeitsschein"
   den Schein „WS-2026-0017" auswählen.
3. Buchung speichern. Wiederholen für alle Einsatzzeiten.
4. Arbeitsschein „WS-2026-0017" öffnen → „Signieren" → Kunde
   unterzeichnet im Tablet-Workflow.
5. Status springt auf SIGNED.
6. Im Action-Bar erscheint Button „Rechnung erzeugen". Klicken.
7. Dialog zeigt Vorschlag mit allen zugeordneten Buchungen + Anfahrt.
8. Zeile „Anfahrt: 45 Minuten" — Einzelpreis prüfen, ggf. anpassen.
9. „Erzeugen" → Browser leitet zur Rechnung „R-2026-0123" im DRAFT.
10. In der Rechnung: Adresse + Positionen prüfen, ggf. Header/Footer
    setzen, abschließen via „Drucken/Finalisieren".

### Hinweise zum Stundensatz

**Stundensatz pro Buchung** (Lookup-Reihenfolge):
1. `Auftrag.Stundensatz` (Auftrag-Stammdaten, Feld
   "Abrechnungsstundensatz") — gilt einheitlich für alle Mitarbeiter
   dieses Auftrags.
2. Sonst `Mitarbeiter.Stundensatz` (Mitarbeiter-Stammdaten,
   Personalverwaltung-Reiter) — der individuelle Satz des Mitarbeiters,
   der die Buchung erfasst hat.
3. Sonst `0,00 EUR` — die Position erscheint im Dialog rot markiert
   mit dem Hinweis "Stundensatz nicht ermittelbar — bitte manuell
   eintragen". Der Disponent muss vor dem Klick auf „Erzeugen" einen
   Wert eintragen.

**Stundensatz für die Anfahrt-Position** (Multi-Mitarbeiter-Logik):

Wenn an einem Arbeitsschein **mehrere Mitarbeiter** zugewiesen sind und
diese unterschiedliche `Mitarbeiter.Stundensatz`-Werte haben, wählt das
System für die Anfahrt-Position automatisch den **höchsten Stundensatz**
aller zugewiesenen Mitarbeiter (Maximum-Strategie).

*Beispiel*: Arbeitsschein hat Anna (50,00 EUR/h) und Bert (75,00 EUR/h).
Anfahrt 45 Minuten → Position „Anfahrt: 45 Minuten", Menge 0,75 h,
Einzelpreis **75,00 EUR** (Maximum aus 50,00 und 75,00).

*Begründung*: Defensive Vorbefüllung — der Disponent kann den Wert im
Dialog jederzeit manuell überschreiben oder die Position komplett
entfernen. Der Maximum-Wert verhindert, dass eine teure Mitarbeiter-
Stunde unbeabsichtigt zum günstigeren Satz abgerechnet wird, wenn der
Disponent die Anfahrt nicht aktiv prüft.

*Wenn `Auftrag.Stundensatz` gesetzt ist*: dieser hat Vorrang vor allen
Mitarbeiter-Sätzen, auch bei der Anfahrt — keine Maximum-Logik nötig,
weil die Order-Rate für alle Mitarbeiter gleich gilt.

*Wenn keiner der Mitarbeiter einen Stundensatz hat und auch kein
Auftrags-Stundensatz gesetzt ist*: Position erscheint rot markiert mit
0,00 EUR — manuelle Eingabe erforderlich.

### Sonstige Hinweise
- Wenn Arbeitsschein storniert (VOID): „Rechnung erzeugen" verschwindet.
- Wenn Rechnung bereits existiert: Button zeigt stattdessen
  „Zur Rechnung R-…".
- Wenn Rechnung storniert wurde: Button erscheint wieder, neue
  Rechnung kann erzeugt werden; alte bleibt als historische Referenz
  erhalten.
- Wenn dem Arbeitsschein kein Service-Objekt mit Kunden-Adresse
  zugeordnet ist: Generate ist gesperrt mit Hinweis. Erst Service-Objekt
  am Auftrag pflegen, dann erneut versuchen.
```

#### F.2 Manuelle Verifikations-Checkliste

Im frischen Dev-Tenant einmal komplett durchklicken (alle Test-Cases
aus dem Ticket-Spec sowie alle Edge-Cases aus diesem Plan):

- [ ] WorkReport mit allen Mitarbeitern ohne `hourlyRate` und Order ohne
      `billingRatePerHour` → Vorschläge mit Einzelpreis 0.00 und
      visuell markiert (rote Border)
- [ ] WorkReport mit `serviceObject = null` → "Erzeugen" disabled,
      Banner "kein Service-Objekt …" sichtbar
- [ ] WorkReport mit ServiceObject aber `customerAddressId` (DB-manipuliert
      auf null) → gleicher Banner
- [ ] Storno einer erzeugten Rechnung in `BillingDocument`-UI, dann
      erneutes Generate → success, beide Dokumente in DB, neues mit
      `workReportId`, altes behält `workReportId` als historische
      Referenz
- [ ] WorkReport ohne zugeordnete Bookings + ohne Travel → Dialog zeigt
      informatives Banner "noEligibleBookings" ("Keine Buchungen oder
      Anfahrt zugeordnet. Sie können manuelle Positionen ergänzen.").
      Vorschlags-Tabelle ist leer. Button "Erzeugen" bleibt **disabled
      bis mindestens eine manuelle Position via 'Manuelle Position
      hinzufügen' angelegt wurde**. Nach Anlage der manuellen Position
      → Button aktiv → Generate erfolgreich → BillingDocument enthält
      ausschließlich Manual-Positionen, `workReportId` korrekt gesetzt.
- [ ] WorkReport-Status auf VOID setzen (DB-direct via Studio oder via
      regulären `voidReport`-Flow) → "Rechnung erzeugen"-Button ist
      nicht mehr sichtbar im Action-Bar; auch der "Zur Rechnung …"-
      Button wird nicht angezeigt (Action-Bar ist Status-konditional).
- [ ] Konkurrente Doppel-Generates (zwei Browser-Tabs gleichzeitig
      auf SIGNED-Schein) → einer success, anderer CONFLICT (mit
      `existingDocumentNumber` in error message)
- [ ] OrderBooking-Form: bei einem SIGNED WorkReport-Wechsel der
      Buchung von `null` auf SIGNED-Schein → BAD_REQUEST (Anti-Tampering)
- [ ] OrderBooking löschen, dessen `workReportId` auf eine bereits
      generierte Rechnung verweist → DB-Cascade SetNull, Rechnung
      bleibt unverändert (historische Konsistenz)

### Success Criteria

#### Automated Verification:
- [x] Alle Tests aus Phasen A-E grün: 125/125 R-1 + adjacent tests
- [x] Type-Check grün: `pnpm typecheck` (no new errors in R-1 files)
- [ ] Lint grün: `pnpm lint`

#### Manual Verification:
- [ ] Komplette Manual-Verifikations-Checkliste durchgeklickt und alle
      Punkte als bestanden vermerkt
- [ ] Smoke-Test: 3 verschiedene WorkReports mit unterschiedlichen
      Konfigurationen erfolgreich abgerechnet
- [x] Handbuch-Sektion §13.17 hinzugefügt mit Praxisbeispiel +
      Stundensatz-Erklärung + Multi-Mitarbeiter-Anfahrt-Logik +
      Idempotenz-Hinweisen (`docs/TERP_HANDBUCH.md`)
- [ ] Audit-Log-Browser zeigt nach Generate beide Einträge mit korrektem
      Cross-Link in metadata

---

## Testing Strategy

### Unit Tests
- `work-report-invoice-bridge-service.test.ts`: Stundensatz-Chain,
  Position-Berechnungen, Sortierung, Status-Validation,
  Idempotenz-Logik, Address-Resolution
- `billing-document-service.test.ts`: bestehender Test um Test-Case für
  `workReportId`-Persistierung erweitern (1 zusätzlicher Test)

### Integration Tests
- `work-report-invoice-bridge-service.integration.test.ts`: Full-Flow
  mit echter DB inkl. Cross-Tenant-Isolation, Idempotenz, Storno+Re-Generate
- `workReports-generate-invoice.test.ts` (Router-Test): Permission-Gates,
  Input-Validation, Error-Mapping nach TRPCError-Codes

### E2E Tests
- `83-work-report-invoice-generation.spec.ts`: Happy-Path + Edit +
  Conflict-Banner

### Manual Testing Steps
- Siehe Phase F Manual-Verifikations-Checkliste

---

## Performance Considerations

- **Preview-Query**: `computeProposedPositions()` lädt alle Bookings
  + Assignments des WorkReports. Realistic-Worst-Case: ~30 Bookings
  pro Schein → 1 Round-Trip mit Includes, < 50ms.
- **Idempotenz-Lookup**: zusätzlicher `BillingDocument.findFirst` mit
  Index `[tenantId, workReportId]`. Index ist hochselektiv, < 5ms.
- **Generate-Mutation**: 1 Transaktion mit Document-Create + N×Position-
  Create + 2× Audit-Log. Realistic ~30 Positionen → < 200ms total. Kein
  PDF-Generate triggered (Status bleibt DRAFT bis manuelles Finalize).

Keine Optimierungen vorab nötig.

---

## Migration Notes

- **VAT_DEFAULT-Konstante**: `19.0` als Modul-Konstante in
  `work-report-invoice-bridge-service.ts`. Tenant-weiter Default-VAT
  ist eigenes Folge-Ticket; siehe Open Questions im Research-Doc.
- **Bestehende OrderBookings**: erhalten `workReportId = NULL` (kein
  Backfill). Disponent muss Zuordnung pro Booking manuell pflegen,
  wenn alte Aufträge nachträglich abgerechnet werden sollen.
- **Bestehende BillingDocuments**: erhalten `workReportId = NULL`.
- **WhStockMovement.workReportId-FK** (`schema.prisma:5740`): bleibt
  unverändert. Material-Übernahme ist out of scope; das Feld wird in
  R-1 nicht gelesen oder geschrieben.
- **Idempotenz via Service-Schicht**, nicht via DB-Constraint. Begründung
  im Ticket: Storno → Re-Generate-Szenario würde von einem
  Unique-Constraint blockiert.
- **handleServiceError-Erweiterung**: das neue
  `*PreconditionFailedError`-Mapping wird zukünftig auch für andere
  Bridge-/Lifecycle-Services nutzbar sein — ist eine bewusste
  Erweiterung der Standardkonvention, kein Sonderpfad.

---

## File Budget Tracking

Ziel: 18-22 produktive Files.

| # | Datei | Status | Phase |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | edit | A |
| 2 | `supabase/migrations/<ts>_add_workreport_idempotency_links.sql` | new | A |
| 3 | `src/lib/services/work-report-invoice-bridge-service.ts` | new | B |
| 4 | `src/lib/services/__tests__/work-report-invoice-bridge-service.test.ts` | new | B |
| 5 | `src/lib/services/__tests__/work-report-invoice-bridge-service.integration.test.ts` | new | B |
| 6 | `src/lib/services/billing-document-service.ts` | edit | B |
| 7 | `src/trpc/errors.ts` | edit | B |
| 8 | `src/trpc/routers/workReports.ts` | edit | C |
| 9 | `src/trpc/routers/__tests__/workReports-generate-invoice.test.ts` | new | C |
| 10 | `src/trpc/routers/orderBookings.ts` | edit | D |
| 11 | `src/lib/services/order-booking-service.ts` | edit | D |
| 12 | `src/components/orders/order-booking-form-sheet.tsx` | edit | D |
| 13 | `src/hooks/use-work-report-invoice-preview.ts` | new | E |
| 14 | `src/hooks/use-generate-work-report-invoice.ts` | new | E |
| 15 | `src/components/work-reports/work-report-generate-invoice-dialog.tsx` | new | E |
| 16 | `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx` | edit | E |
| 17 | `src/e2e-browser/specs/83-work-report-invoice-generation.spec.ts` | new | E |
| 18 | `TERP_HANDBUCH_V2.md` | edit | F |

Aktueller Plan-Stand: **18 Files**. Im Budget. Bei zusätzlichen
unvorhergesehenen Touchpoints: PAUSE + Deviation Note.

---

## Implementation Notes

### IN-1 — Audit-Log-Pattern verifiziert (Phase B)

**Annahme**: T-3 nutzt `.catch((err) => console.error(...))` (fire-and-forget).

**Verifikation** (2026-04-27, gegen `service-schedule-service.ts:640-678`):

```ts
// Audit rows inside the tx so they commit atomically with the order.
// We use the same catch-and-log pattern as elsewhere — audit must
// never break the business operation.
await auditLog
  .log(tx, { ... })
  .catch((err) => console.error("[AuditLog] Failed:", err))
```

Bestätigt — T-3 wirft NICHT bei Audit-Fehler. R-1 folgt diesem Pattern
1:1. Beide `auditLog.log()`-Calls innerhalb der `prisma.$transaction`,
beide mit `.catch((err) => console.error("[bridge] audit failed:", err))`.

**Wenn dieser Befund in der Implementierung anders ausfallen sollte**
(z. B. weil sich das Pattern zwischen Plan und Build geändert hat):
PAUSE + neue Deviation Note. Begründung jeder Abweichung muss notieren,
warum R-1 sich entweder dem neuen Pattern anpasst oder bewusst beim alten
bleibt.

### IN-2 — PRECONDITION_FAILED-Erweiterung in handleServiceError

R-1 fügt `*PreconditionFailedError` als neues Suffix-Mapping ein
(siehe Phase B.3). Während der Implementierung NICHT mit-migrieren —
also bestehende state-transition-Errors behalten ihr aktuelles Mapping.
Begründung: Mapping-Änderungen ändern öffentliche TRPC-Error-Codes und
können Frontend-Error-Handling brechen.

**Inventar der state-transition-Errors, die semantisch
PRECONDITION_FAILED wären** (für ein zukünftiges Audit-Cleanup-Ticket
zu dokumentieren — NICHT in R-1 anfassen):

| Error-Klasse | Heutiges `this.name` | Heutiges Mapping | Datei |
|---|---|---|---|
| `WorkReportNotEditableError` | `WorkReportValidationError` | `BAD_REQUEST` | `work-report-service.ts:80` |
| `WorkReportAlreadySignedError` | `WorkReportConflictError` | `CONFLICT` | `work-report-service.ts:93` |
| `WorkReportAlreadyVoidedError` | `WorkReportConflictError` | `CONFLICT` | `work-report-service.ts:106` |
| `BillingServiceCaseValidationError` (state-Branch in `setClosed`) | `BillingServiceCaseValidationError` | `BAD_REQUEST` | `billing-service-case-service.ts:245` |
| `DailyValueValidationError` (state-Branch in `approve`) | `DailyValueValidationError` | `BAD_REQUEST` | `daily-value-service.ts:237,247` |
| `CrmTaskConflictError` (in `complete`) | `CrmTaskConflictError` | `CONFLICT` | `crm-task-service.ts:287` |
| `CrmTaskValidationError` (state-Branch in `cancel`) | `CrmTaskValidationError` | `BAD_REQUEST` | `crm-task-service.ts:323-325` |

**Entscheidung für R-1**: bewusst lassen. Begründung:
1. R-1 ist scope-mäßig auf "Generate Invoice from WorkReport" begrenzt.
2. Mapping-Änderungen sind potenziell breaking für Clients, die heute
   `code === "CONFLICT"` oder `code === "BAD_REQUEST"` als Fehler-
   Discriminator nutzen.
3. Eigenes Audit-Cleanup-Ticket sauberer; eigenes Folge-Ticket sollte
   außerdem Frontend-Toast-Strings + i18n-Keys parallel migrieren.

**Separater Bug-Befund** (NICHT R-1-Scope, aber während der Recherche
auffällig):

`PaymentRunInvalidStateError` (`payment-run-service.ts:59-64`) hat
`this.name = "PaymentRunInvalidStateError"` — dieser Suffix matcht
heute KEINEN Branch in `handleServiceError`. Effekt: alle Aufrufer
bekommen `INTERNAL_SERVER_ERROR` statt eines vernünftigen Codes.
Empfohlene Aktion außerhalb von R-1: separates Bug-Ticket
"Payment-Run-Status-Errors mappen auf 500 statt 400" anlegen.
Wenn das R-1 implementierende `*PreconditionFailedError`-Suffix
sinnvoll mit-greift, kann das Ticket als Resolution `this.name =
"PaymentRunPreconditionFailedError"` setzen — das ist aber
nicht-bindend für R-1.

### IN-3 — Beobachtungen für zukünftige Tickets (Awareness, nicht-bindend)

- **Tenant-weite Default-VAT**: nicht vorhanden (`Tenant`,
  `BillingTenantConfig`, `SystemSetting` enthalten kein `defaultVatRate`).
  Konstante `VAT_DEFAULT = 19.0` in R-1 ist temporäre Lösung. Eigenes
  Folge-Ticket falls Pro-Di flexible VAT-Defaults will.
- **`Activity` hat keine `rate`/`defaultRate`-Spalte**. Sollte
  Activity-spezifische Stundensätze in Zukunft gewünscht sein, ist das
  ein Schema-Add, NICHT ein R-1-Anliegen.
- **`Order` hat keinen `customerAddressId`**. Adress-Auflösung läuft
  ausschließlich über `ServiceObject.customerAddressId` (siehe
  Deviation D-1). Sollte ein Order ohne ServiceObject existieren und
  abrechenbar sein müssen, wäre das ein separates Schema-Anliegen.

## Deviations

### D-1 — `WorkReportNoAddressError` Hard-Fail statt Soft-Warning

**Annahme im Ticket-Spec**: "Fallback-Verhalten: Generate erlaubt ohne
Adresse, `BillingDocument.addressId = null`, Disponent ergänzt manuell."

**Tatsächlich vorgefunden** (verifiziert 2026-04-27):
- `BillingDocument.addressId` ist im Schema NON-NULL
  (`schema.prisma:1110`).
- `billing-document-service.create()` (`billing-document-service.ts:205-236`)
  validiert das Address-Existence-Constraint per
  `findFirst({id, tenantId})`. Bei `addressId = null` würde der
  Aufruf in der Z-Schema-Validation oder in der
  `findFirst`-Query scheitern.
- `Order` hat keinen `customerAddressId`-FK
  (`schema.prisma:2566-2605`) — kein Sekundär-Fallback.

**Resolution**: `WorkReportNoAddressPreconditionFailedError` als harter
Throw → `PRECONDITION_FAILED`. Dialog zeigt Banner "Diesem
Arbeitsschein ist kein Service-Objekt mit Kunden-Adresse zugeordnet.
Bitte das Service-Objekt im Auftrag setzen, dann erneut versuchen."
Button "Erzeugen" disabled.

**Begründung**: Die einzige Alternative wäre, `BillingDocument.addressId`
nullable zu machen — das ist ein billing-modulweiter Eingriff (PDF-/
XRechnung-Generation, `create`-Validierung, alle Reports). Eindeutig
out of scope für R-1.

**Folge für andere Phasen**: Phase E (Dialog) implementiert
NoAddress-Banner + Disabled-State; Phase B Tests verifizieren den Throw;
Phase F Manual-Verifikation testet das Verhalten. Keine Auswirkung auf
Phase A/C/D.

---

*(Neue Deviations hier anhängen mit Format D-2, D-3, …)*

## References

- Original ticket: dieses Plan-Dokument (R-1 Spec im Plan-Briefing)
- Research: `thoughts/shared/research/2026-04-24-rechnungs-uebernahme-arbeitsschein.md`
- T-3 Plan (Vorbild dual-log Pattern + Generate-Dialog):
  `thoughts/shared/plans/2026-04-22-serviceobjekte-wartungsintervalle.md`
- M-1 Plan (Vorbild WorkReport-Status-Lifecycle + i18n-freie UI):
  `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md`
- Audit dual-write Vorbild (Code):
  `src/lib/services/service-schedule-service.ts:643-678`
- BillingDocument-Source-Pattern:
  `src/lib/services/billing-document-service.ts:205-236` (create-Signatur),
  `src/lib/services/billing-document-service.ts:949-966` (addPosition)
- handleServiceError-Konvention:
  `src/trpc/errors.ts:10-105`
- Schema-Anchors:
  `prisma/schema.prisma:1102-1189` (BillingDocument),
  `prisma/schema.prisma:1199-1222` (BillingDocumentPosition),
  `prisma/schema.prisma:2658-2704` (WorkReport),
  `prisma/schema.prisma:2706-2724` (WorkReportAssignment),
  `prisma/schema.prisma:5447-5476` (OrderBooking),
  `prisma/schema.prisma:2575` (Order.billingRatePerHour),
  `prisma/schema.prisma:2182` (Employee.hourlyRate),
  `prisma/schema.prisma:941` (ServiceObject.customerAddressId),
  `prisma/schema.prisma:671-679` (BillingPositionType-Enum)
