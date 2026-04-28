---
date: 2026-04-24T14:26:56+02:00
researcher: tolga
git_commit: 2aff2f0bdd3046f39fcac547e2b860e6169cf412
branch: staging
repository: terp
topic: "Rechnungs-Übernahme aus Arbeitsschein (R-1) — IST-Bestandsaufnahme"
tags: [research, codebase, workreport, arbeitsschein, billing, invoice-generation, time-and-material, hourly-rate, audit, idempotency]
status: complete
last_updated: 2026-04-24
last_updated_by: tolga
---

# Research: Rechnungs-Übernahme aus Arbeitsschein (R-1) — IST-Bestandsaufnahme

**Date**: 2026-04-24T14:26:56+02:00
**Researcher**: tolga
**Git Commit**: 2aff2f0bdd3046f39fcac547e2b860e6169cf412
**Branch**: staging
**Repository**: terp

## Research Question

Dokumentation des Codebase-Stands für R-1 (1-Klick-Workflow
"Rechnungs-DRAFT aus signiertem `WorkReport`"). Abgefragt in 8
Blöcken: WorkReport-Datenquelle, BillingDocument-Integration,
Stundensatz/Preis-Lookup, UI-Patterns, Berechtigungen/Audit,
Status-Lifecycle/Idempotenz, i18n/Namespacing, Test-Patterns.
Scope: ausschliesslich IST-Zustand — keine Lösungsvorschläge.

## Summary

Der Codebase ist strukturell weit genug, dass R-1 auf existierenden
Patterns aufbauen kann. Die wichtigsten Befunde im Überblick:

- **WorkReport-Datenquelle (Block 1)** — `WorkReport` hat FK auf
  `Order` und `ServiceObject`, aber **keinen direkten Link zu
  `OrderBooking`**. Zeitbuchungen hängen nur am Auftrag, nicht am
  Arbeitsschein. `WhStockMovement.workReportId` existiert als Schema-
  FK, wird aber heute **nirgends gesetzt** (immer `null`).
  `order-booking-aggregator.ts` aggregiert nur pro Order (Gesamt-
  minuten), nicht pro Mitarbeiter oder pro Aktivität.

- **BillingDocument-Integration (Block 2)** — `BillingDocument`
  besitzt bereits FK auf `Order` (`orderId`) und auf `CrmInquiry`
  (`inquiryId`), aber keine auf `WorkReport`. Zwei etablierte
  "Generate-From-X"-Patterns existieren:
  `BillingRecurringInvoice → BillingDocument` via
  `billing-recurring-invoice-service.generate()` und
  `BillingServiceCase → BillingDocument` via
  `billing-service-case-service.createInvoice()`. Beide als Vorbild
  geeignet, mit unterschiedlichen Transaktions-Strategien (Repo-
  direct-with-batch-positions vs. Service-with-addPosition).

- **Preis-Lookup (Block 3)** — `Employee.hourlyRate` existiert
  (Decimal?, aus Payroll-Migration), **nicht** `defaultHourlyRate`.
  `Order.billingRatePerHour` existiert als Order-Level-Override.
  **`CustomerHourlyRate`-Tabelle existiert NICHT**; kundenspezifische
  Preise werden heute nur über `CrmAddress.salesPriceListId` +
  `BillingPriceList`/`BillingPriceListEntry` abgebildet — **ohne
  Stundensatz-Semantik**. `WhArticle.vatRate` Default 19.0. **Keine
  Anfahrts-/km-Konfiguration** auf Tenant-Ebene, **kein
  Standard-MwSt pro Tenant**.

- **UI-Patterns (Block 4)** — `generate-order-dialog.tsx`,
  `recurring-generate-dialog.tsx`, `service-case-invoice-dialog.tsx`,
  `document-forward-dialog.tsx` belegen den "Detail-Seite → Aktion →
  Dialog → Mutation → Navigate"-Workflow. Positions-Editor existiert
  in drei Ausprägungen: `RecurringPositionEditor`, `DocumentPositionTable`
  (server-persisted per-field `onBlur`), `ServiceCaseInvoiceDialog`
  (lokales `useState`). Review-mit-Akzept/Verwerfen-Pattern ist in
  `DunningProposalTab` und `ReorderSuggestionsList` ausgebaut.

- **Permissions & Audit (Block 5)** — Billing gliedert sich in fünf
  Unter-Namespaces (`billing_documents.*`, `billing_service_cases.*`,
  `billing_payments.*`, `billing_price_lists.*`, `billing_recurring.*`);
  **keine einzelne `billing.create`-Permission**. WorkReport hat die
  vier erwarteten Keys (view/manage/sign/void).
  Der "Entity-A-erzeugt-Entity-B"-Audit-Stil ist zweigleisig: der
  ServiceSchedule→Order-Flow (`service-schedule-service.generateOrder`)
  schreibt zwei Audit-Einträge mit gegenseitigem `metadata`-Cross-Link;
  der Recurring→Invoice-Flow schreibt nur einen Eintrag (auf das
  Template, nicht auf das Ergebnis-Dokument).

- **Lifecycle & Idempotenz (Block 6)** — `WorkReport` hat **keine**
  Felder zur Tracking-Verknüpfung mit einer erzeugten Rechnung
  (`invoiceId`, `invoicedAt`, etc. fehlen). `BillingDocument` hat
  **keinen** `workReportId`-FK. Kein Schutz gegen Doppel-Erzeugung
  existiert am Datenmodell. Cancel-Flow entkoppelt heute keine
  Source-Entitäten. Der `SIGNED`-Status ist das einzige dokumentierte
  Statusmodell-Präzedenzfall für "Downstream-Artefakte nur aus
  definitivem Quellstatus".

- **i18n & Handbuch (Block 7)** — 97 Top-Level-Namespaces im
  `de.json`. Billing ist aufgeteilt in sieben `billing*`-Namespaces.
  **`workReports`-Namespace fehlt komplett** (WorkReport-UI-Komponenten
  nutzen hardcoded Deutsch, kein `useTranslations`). Konvention für
  cross-module-"Generate"-Dialoge: Strings liegen beim **Source**-
  Entity-Namespace (`serviceSchedules.generateOrder`,
  `billingRecurring.generate*`). Handbuch hat §12c (Arbeitsscheine) vor
  §13 (Belege & Fakturierung).

- **Test-Patterns (Block 8)** — Zwei koexistierende Stile: mocked-
  Prisma-Unit-Tests mit `createMockPrisma({...overrides})` (Muster in
  billing-service-case, billing-document, recurring-invoice,
  work-report-service.unit); real-DB-Integration-Tests mit
  deterministischen Tenant-UUIDs und `beforeAll/afterAll`-Seed-Fixtures
  (Muster in work-report-service.integration). **Kein zentraler
  Fixture-/Factory-Builder** — jeder Test-File definiert eigene inline
  `createDraftReport`/`createDoc`-Helper. tRPC-Router-Tests nutzen die
  zentrale Harness in `src/trpc/routers/__tests__/helpers.ts` mit
  `createMockContext`, `createUserWithPermissions`.

Das Fundament trägt. Neu gebaut werden müssten: (a) der WorkReport-
Invoice-Bridge-Service, (b) eine Form der Preis-Lookup-Strategie
(Employee hourlyRate lesen + ggf. Anfahrt-Config), (c) die Idempotenz-
Verkoppelung (WorkReport→BillingDocument oder umgekehrt), (d) ein
Positions-Editor-Review-UI (Komponenten-Komposition aus existierenden
Patterns machbar).

---

## Detailed Findings

### Block 1 — WorkReport als Datenquelle für Rechnungs-Positionen

#### 1.1 `WorkReport` Prisma-Modell (signierter Zustand)

Schema-Datei: `prisma/schema.prisma:2658-2704`.

Felder (alle):
```
id                  String  UUID PK
tenantId            String  UUID FK Tenant
orderId             String  UUID FK Order (non-null, onDelete Cascade)
serviceObjectId     String? UUID FK ServiceObject (onDelete SetNull)

code                String  VarChar(50)   -- "AS-<n>" per-Tenant
visitDate           DateTime @db.Date
travelMinutes       Int?
workDescription     String? @db.Text

status              WorkReportStatus @default(DRAFT)

signedAt            DateTime? @db.Timestamptz(6)
signedById          String?   UUID FK User
signerName          String?   VarChar(255)
signerRole          String?   VarChar(100)
signerIpHash        String?   VarChar(100)
signaturePath       String?   @db.Text
pdfUrl              String?   @db.Text

voidedAt            DateTime? @db.Timestamptz(6)
voidedById          String?   UUID
voidReason          String?   @db.Text

createdAt           DateTime  @default(now())
updatedAt           DateTime  @updatedAt
createdById         String?   UUID
```

Relations:
- `tenant → Tenant`
- `order → Order` (required, cascade on tenant delete)
- `serviceObject → ServiceObject?`
- `signedBy → User?`, `voidedBy → User?`, `createdBy → User?`
- `assignments → WorkReportAssignment[]`
- `attachments → WorkReportAttachment[]`
- `stockMovements → WhStockMovement[]`

Unique constraint: `(tenantId, code)`.

Enum `WorkReportStatus` (`prisma/schema.prisma:663-669`): `DRAFT`,
`SIGNED`, `VOID`.

Für R-1 relevante Felder im `SIGNED`-Zustand:
- `travelMinutes: Int?` — Anfahrtsdauer in Minuten (keine km-Distanz)
- `workDescription: String?` — Freitext für Positionsbeschreibung
- `visitDate: DateTime @db.Date` — Einsatzdatum, als Leistungszeitpunkt
- `orderId: String` — Bindung an Auftrag (nicht nullable)
- `serviceObjectId: String?` — Bindung an Objekt (optional)
- `assignments` — 1:n Mitarbeiter-Zuweisungen

#### 1.2 `WorkReportAssignment`

Schema-Datei: `prisma/schema.prisma:2706-2724`.
```
id           String   UUID PK
tenantId     String   UUID
workReportId String   UUID FK WorkReport (onDelete Cascade)
employeeId   String   UUID FK Employee (onDelete Cascade)
role         String?  VarChar(50)
createdAt    DateTime @default(now())
```
Unique: `(workReportId, employeeId)` plus SQL-Partial-Index
`(work_report_id, employee_id) WHERE role IS NULL`
(`prisma/schema.prisma:2653-2656`).

Insert-Pfad: `src/lib/services/work-report-assignment-service.ts:107`
— eine Zeile pro Mitarbeiter, keine Batch-Variante.

#### 1.3 WorkReport ↔ Order ↔ OrderBooking Beziehungskette

- **Direkter FK `WorkReport.orderId → Order`**: vorhanden,
  `prisma/schema.prisma:2661,2689`.
- **Direkter FK `OrderBooking.workReportId`**: **existiert NICHT.**
  `OrderBooking` hat nur `orderId` als Verbindung zur Order-Domain
  (`prisma/schema.prisma:5451`). Das komplette `OrderBooking`-Modell
  (`prisma/schema.prisma:5447-5476`) trägt keinen `workReportId`.

Beziehungstopologie:
```
WorkReport.orderId  ─┐
                     ├──► Order.id
OrderBooking.orderId ─┘
```

**Filtermöglichkeit "Buchungen dieses Arbeitsscheins":** existiert
nicht am Datenmodell. `order-booking-repository.ts:27` `findMany()`
akzeptiert `orderId` + optionalen Datumsbereich (`fromDate`/`toDate`),
aber kein `workReportId`. Keine Service-Funktion in
`src/lib/services/order-booking-*` nimmt einen `workReportId`-Parameter.

Faktisch heisst das: alle Bookings eines Auftrags sind aus Sicht des
Arbeitsscheins ununterscheidbar, es sei denn man benutzt `bookingDate`
als Heuristik (was dem Einsatzdatum des Arbeitsscheins entsprechen
würde, aber ohne semantische Garantie).

#### 1.4 `WhStockMovement.workReportId` — Schreibe-Sites

Schema: `prisma/schema.prisma:5740` (`workReportId String? @map("work_report_id")`),
Relation `prisma/schema.prisma:5752`, Index
`prisma/schema.prisma:5760` (`@@index([tenantId, workReportId])`).

Alle `WhStockMovement.create*`-Aufrufsstellen im gesamten `src/`-Baum:

| Service | Line | Bezug | `workReportId`? |
|---|---|---|---|
| `wh-stock-movement-service.ts` | 182 (`bookGoodsReceipt`) | Wareneingang | **nicht gesetzt** |
| `wh-stock-movement-repository.ts` | 104 (`create`) | Generisches Create | **nicht im Interface** |
| `wh-withdrawal-service.ts` | 121 (Einzel-Withdrawal) | Materialentnahme | **nicht gesetzt** |
| `wh-withdrawal-service.ts` | 223 (Batch-Withdrawal) | Mehrfache Entnahme | **nicht gesetzt** |
| `wh-withdrawal-service.ts` | 320 (Stornierung) | Reversal | **nicht kopiert** |
| `wh-stocktake-service.ts` | 465 | Inventur | **nicht gesetzt** |
| `billing-document-service.ts` | 1388 | Lieferschein-Ausbuchung | **nicht gesetzt** |

**Konsequenz**: die Spalte existiert und ist indiziert, aber kein
Schreibepfad setzt sie heute. Alle Zeilen haben `workReportId = NULL`.

#### 1.5 `OrderBooking`-Felder

Modell: `prisma/schema.prisma:5447-5476`.
```
id           String   UUID PK
tenantId     String   UUID
employeeId   String   UUID FK Employee
orderId      String   UUID FK Order
activityId   String?  UUID FK Activity
bookingDate  DateTime @db.Date           -- nur Datum, keine Uhrzeit
timeMinutes  Int                          -- Dauer in Minuten, gespeichert
description  String?  @db.Text
source       String   VarChar(20) default "manual"   -- CHECK IN ('manual','auto','import')
createdAt    DateTime
updatedAt    DateTime
createdBy    String?  (bare UUID, keine FK-Relation)
updatedBy    String?  (bare UUID, keine FK-Relation)
```

Wichtige Befunde:
- **Keine** `startedAt`/`endedAt`-Spalten. Duration ist bereits als
  Skalar (`timeMinutes: Int`) gespeichert — **nicht** abgeleitet.
- **Kein** `billable`-Flag.
- `activityId` ist Nullable-FK auf `Activity`
  (`prisma/schema.prisma:2535`), kein Enum. `Activity` hat nur
  `id`, `tenantId`, `code`, `name`, `description`, `isActive` —
  **keinen Preis- oder Billable-Rate-Default**.

#### 1.6 `order-booking-aggregator`

Datei: `src/lib/services/order-booking-aggregator.ts` — existiert als
dedizierte Datei mit zwei exportierten Funktionen.

**`getBookingSummaryByOrder(prisma, tenantId, orderId)`** (Zeile 17):
```typescript
prisma.orderBooking.groupBy({
  by: ["orderId"],
  where: { tenantId, orderId },
  _sum: { timeMinutes },
  _count: true,
  _max: { bookingDate },
})
```
Return: `{ orderId, totalMinutes, bookingCount, lastBookingDate }`.

**`getBookingSummariesByOrders(prisma, tenantId, orderIds)`**
(Zeile 38): Map-Variante für Bulk-Abfragen, füllt `orderIds` ohne
Bookings mit Null-Werten auf.

**Keine Per-Employee-Aggregation, keine Per-Activity-Aggregation
vorhanden.** Nur Summe pro Order. Für Per-Mitarbeiter-Minuten muss
heute `repository.findMany({ orderId, ... })` verwendet und in
Anwendungslogik aggregiert werden.

---

### Block 2 — BillingDocument-Integration

#### 2.1 `BillingDocument`-Modell komplett

Schema: `prisma/schema.prisma:1102-1190`.

Strukturfelder (alle):
```
id                  UUID PK
tenantId            UUID  @map("tenant_id")                  -- REQUIRED
number              VarChar(50)                               -- REQUIRED (von Sequenz)
type                BillingDocumentType                       -- REQUIRED
status              BillingDocumentStatus @default(DRAFT)

-- Addressing
addressId           UUID  @map("address_id")                  -- REQUIRED
contactId           UUID? @map("contact_id")
deliveryAddressId   UUID? @map("delivery_address_id")
invoiceAddressId    UUID? @map("invoice_address_id")

-- Source linkage
inquiryId           UUID? @map("inquiry_id")
orderId             UUID? @map("order_id")                    -- FK auf Order
parentDocumentId    UUID? @map("parent_document_id")          -- Belegkette

-- Dates / Period
orderDate           DateTime?
documentDate        DateTime @default(now())
deliveryDate        DateTime?
servicePeriodFrom   DateTime? @db.Date
servicePeriodTo     DateTime? @db.Date

-- Terms
deliveryType        String?
deliveryTerms       String?
paymentTermDays     Int?
discountPercent     Float?
discountDays        Int?
discountPercent2    Float?
discountDays2       Int?
shippingCostNet     Float?
shippingCostVatRate Float?

-- Totals (computed by recalculateTotals())
subtotalNet         Float @default(0)
totalVat            Float @default(0)
totalGross          Float @default(0)

-- Notes + Texts
notes               String?
internalNotes       String?
headerText          String?
footerText          String?

-- Dunning
dunningBlocked      Boolean @default(false)
dunningBlockReason  String?

-- Finalize artefacts
pdfUrl              String?
eInvoiceXmlUrl      String?
printedAt           DateTime?
printedById         UUID?

-- Audit
createdAt           DateTime
updatedAt           DateTime
createdById         UUID?
```

**Enum `BillingDocumentType`** (`prisma/schema.prisma:641`):
`OFFER | ORDER_CONFIRMATION | DELIVERY_NOTE | SERVICE_NOTE | RETURN_DELIVERY | INVOICE | CREDIT_NOTE`.

**Enum `BillingDocumentStatus`** (`prisma/schema.prisma:653`):
`DRAFT | PRINTED | PARTIALLY_FORWARDED | FORWARDED | CANCELLED`.

**Pflicht beim Create**: `type`, `addressId`. Alles andere optional.
Sequenz-Nummer wird im Service innerhalb der Transaktion gezogen.

**Finalize setzt**: `status="PRINTED"`, `printedAt`, `printedById`.
Nach Transaktion: `pdfUrl`, bei `INVOICE`/`CREDIT_NOTE`
`eInvoiceXmlUrl` (falls `eInvoiceEnabled`).

Unique: `[tenantId, number]`.

#### 2.2 `BillingDocumentPosition`

Schema: `prisma/schema.prisma:1199-1223`.
```
id            UUID PK
documentId    UUID FK BillingDocument (onDelete Cascade)
sortOrder     Int                     -- 1-based, set via getMaxSortOrder()+1
type          BillingPositionType @default(FREE)
articleId     UUID? FK WhArticle
articleNumber VarChar(50)?
description   String?
quantity      Float?
unit          VarChar(20)?
unitPrice     Float?
flatCosts     Float?
totalPrice    Float?                  -- computed: round(qty*unit + flat, 2)
priceType     BillingPriceType?       -- STANDARD | ESTIMATE | BY_EFFORT
vatRate       Float?
deliveryDate  DateTime?
confirmedDate DateTime?
createdAt     DateTime
updatedAt     DateTime
```

Enum `BillingPositionType` (`prisma/schema.prisma:671`):
`ARTICLE | FREE | TEXT | PAGE_BREAK | SUBTOTAL`.

Index: `[documentId, sortOrder]`.

**`totalPrice`-Berechnung** (`billing-document-service.ts:149-161`):
```
totalPrice = Math.round((quantity * unitPrice + flatCosts) * 100) / 100
// oder null, wenn alle drei Input-Werte 0/undefined
```
Dokument-Ebene `subtotalNet = SUM(positions.totalPrice)`
(`billing-document-service.ts:105-145`). **Kein Rabatt oder
`totalNet`/`totalGross` pro Position.** MwSt wird als Rate gespeichert,
aggregiert in `totalVat`.

#### 2.3 Kanonische `create`-Funktion

Datei: `src/lib/services/billing-document-service.ts:205-357`.

Signatur:
```typescript
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    type: BillingDocumentType
    addressId: string
    contactId?: string
    deliveryAddressId?: string
    invoiceAddressId?: string
    inquiryId?: string
    orderId?: string
    orderDate?: Date
    documentDate?: Date
    deliveryDate?: Date
    servicePeriodFrom?: Date | null
    servicePeriodTo?: Date | null
    deliveryType?: string
    deliveryTerms?: string
    paymentTermDays?: number
    discountPercent?: number
    discountDays?: number
    discountPercent2?: number
    discountDays2?: number
    shippingCostNet?: number
    shippingCostVatRate?: number
    notes?: string
    internalNotes?: string
    headerText?: string
    footerText?: string
  },
  createdById: string,
  audit: AuditContext,
)
```

Return: Prisma `BillingDocument`-Objekt mit
`include: { address, contact, positions }` (von `repo.create()`).

**Transaktion**: gesamter Create-Flow einschliesslich Sequenz-
Acquisition läuft in `prisma.$transaction(...)` (Zeilen 285-341).

**Positionen nicht im Create-Input** — werden separat via
`addPosition()` oder `repo.createManyPositions()` angelegt.

**Payment-Terms Auto-Fallback** (Zeilen 279-281): Aus CrmAddress
übernommen, wenn nicht im Input gesetzt.

**Default-Template Auto-Apply** (Zeilen 293-309): Wenn weder
`headerText` noch `footerText` gesetzt, wird ein Default-Template
aufgelöst.

**Keine Idempotenz-Mechanik** im Create ausser `(tenantId, number)`
UNIQUE-Constraint.

#### 2.4 Nummernkreis für `RE-`-Prefix

Datei: `src/lib/services/number-sequence-service.ts`.

Funktion `getNextNumber(prisma, tenantId, key)` (Zeile 95-108):
- Upserted `NumberSequence` atomar mit `{ increment: 1 }` auf
  `nextValue`.
- Formatiert zurück als `${seq.prefix}${seq.nextValue - 1}`.
- Auto-Create bei erstem Aufruf mit `nextValue: 2`, also liefert
  den ersten Wert als `1`.

Type-spezifische Keys (Zeilen 60-68):
```
OFFER              → "offer"              (prefix "A-")
ORDER_CONFIRMATION → "order_confirmation" (prefix "AB-")
DELIVERY_NOTE      → "delivery_note"      (prefix "LS-")
SERVICE_NOTE       → "service_note"       (prefix "LN-")
RETURN_DELIVERY    → "return_delivery"    (prefix "R-")
INVOICE            → "invoice"            (prefix "RE-")
CREDIT_NOTE        → "credit_note"        (prefix "G-")
```

Zusätzlich existiert für `WorkReport` bereits der Key `"work_report"`
(prefix `"AS-"`) — siehe `work-report-service.ts` (M-1).

**Je ein Counter pro Dokumenttyp und Tenant.** Sequenz-Akquisition
findet innerhalb der Create-Transaktion statt (Transaction-Client
wird als `tx as unknown as PrismaClient` gecastet).

#### 2.5 `addressId`-Handling

Pflicht-Feld auf dem Modell (`prisma/schema.prisma:1112`), Pflicht im
Create-Input (`billing-document-service.ts:210`). Relation heisst
`address` (unbenannt); `deliveryAddress` und `invoiceAddress` sind
namened relations.

Sourcing in existierenden Generate-From-Flows:
- **ServiceCase → Invoice** (`billing-service-case-service.ts:301-311`):
  `addressId = existing.addressId` (vom Service-Case)
- **RecurringInvoice → Invoice** (`billing-recurring-invoice-service.ts:424-441`):
  `addressId = template.addressId` (vom Template)
- **Document → Forward** (`billing-document-service.ts:692-720`):
  `addressId = existing.addressId` (vom Parent-Document)
- **Document → Duplicate** (`billing-document-service.ts:873-901`):
  kopiert

**Kein Flow leitet `addressId` heute aus `Order` ab** — der
`Order`-Record hat gar kein `addressId`-Feld; er trägt nur einen
Freitext `customer String?`. `ServiceObject` hat `customerAddressId`,
aber das ist auf `ServiceObject`, nicht auf `Order`.

#### 2.6 Existierende "Generate Invoice from X"-Workflows

**Pattern A — `BillingRecurringInvoice → BillingDocument` (direktes
Repo-Write mit Batch-Positionen):**

Datei: `src/lib/services/billing-recurring-invoice-service.ts:387-507`.

Signatur:
```typescript
export async function generate(
  prisma: PrismaClient,
  tenantId: string,
  recurringId: string,
  generatedById: string,
  audit?: AuditContext,
)
```

Ablauf (alles in einer `$transaction`):
1. `repo.findById(tx, tenantId, recurringId)` — Template laden.
2. `numberSeqService.getNextNumber(tx, tenantId, "invoice")` — Nummer.
3. `calculateServicePeriod(...)` — Leistungszeitraum.
4. `billingDocRepo.create(tx, { ... addressId: template.addressId ... })`
   — **Repo direkt**, nicht `service.create()`.
5. `billingDocRepo.createManyPositions(tx, positions.map(...))` —
   Batch-Insert aller Positionen, `sortOrder: i + 1` manuell.
6. `billingDocService.recalculateTotals(tx, tenantId, invoiceDoc.id)`
   — Summen einmalig neu berechnen.
7. `template.nextDueDate = calculateNextDueDate(...)` — Cursor advancen
   als Idempotenz-Schutz (siehe Block 6).

Besonderheit: `billingDocService.create()` wird **umgangen**, weil
Service-Level Address-Validierung + Nested-Transactions nicht mit
dem flachen TX-Scope harmonieren.

**Pattern B — `BillingServiceCase → BillingDocument` (Service mit
`addPosition`-Loop):**

Datei: `src/lib/services/billing-service-case-service.ts:265-335`.

Signatur:
```typescript
export async function createInvoice(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  positions: Array<{
    description: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    vatRate?: number
  }>,
  createdById: string,
  audit: AuditContext,
)
```

Ablauf in `$transaction`:
1. Lade + validiere ServiceCase (`status === "CLOSED"`, kein
   `invoiceDocumentId` vorhanden).
2. `billingDocService.create(txPrisma, tenantId, { type: "INVOICE",
   addressId: existing.addressId, ... }, createdById, audit)` —
   **Service-Call** inkl. Adress-Check, Sequenz, Template-Auto-Apply.
3. Loop: `billingDocService.addPosition(txPrisma, tenantId, { ... }, audit)`
   — eine Position pro Call, jede öffnet eigene `$transaction` mit
   DRAFT-Guard + Sort-Order + Recalculate.
4. Update ServiceCase: `invoiceDocumentId = invoice.id`, `status =
   "INVOICED"`.

Positions-Typ hartkodiert auf `"FREE"` für alle Dialog-Positionen.

**Pattern C — Platform Subscription Autofinalize**
(`src/lib/platform/subscription-autofinalize-service.ts:46-212`):
Keine Erzeugung, nur Finalisierung bestehender DRAFTs. Irrelevant für
R-1's Generierungs-Teil, aber zeigt das `internalNotes`-Marker-Pattern
als weichen Rückbezug (`[platform_subscription:<id>]`).

**Pattern D — `forward()` / `duplicate()`** — Beide nutzen
Pattern A (Repo-direct + `createManyPositions`).

---

### Block 3 — Stundensatz und Preis-Lookup

#### 3.1 `Employee`-Stundensatz

`Employee.hourlyRate` (`prisma/schema.prisma:2182`) existiert:
```
hourlyRate  Decimal?  @map("hourly_rate")  @db.Decimal(10, 2)
```
Nullable Decimal(10,2). Added via Migration `20260416100000` als Teil
der Payroll-Stammdaten-Erweiterung, zusammen mit `grossSalary`,
`paymentType`, `salaryGroup`.

**`defaultHourlyRate`/`standardRate`/`billableRate` existieren nicht**
als Field-Namen. Die Semantik "Billing-Rate für Mitarbeiter" wird auf
`hourlyRate` projiziert.

Zusätzlich gibt es `EmployeeCompensationHistory.hourlyRate`
(`prisma/schema.prisma:4478`), ebenfalls `Decimal(10,2)` nullable —
die zeitlich gültige Historie der Compensation-Felder.

#### 3.2 `CrmAddress`-Kundenspezifische Rate-Tabelle

`CrmAddress` (`prisma/schema.prisma:481`) trägt:
- `salesPriceListId  UUID?  @map("sales_price_list_id")`
  (`prisma/schema.prisma:505`)
- `purchasePriceListId UUID?  @map("purchase_price_list_id")`
  (`prisma/schema.prisma:506`)

Relations: `"SalesPriceList"` und `"PurchasePriceList"` auf
`BillingPriceList` (`prisma/schema.prisma:528-529`).

**Kein Feld/Relation `customerHourlyRates`, `hourlyRateOverrides`,
kein Child-Table `CustomerHourlyRate`.** Verifiziert durch
Schema-Volltextsuche auf alle drei Varianten — keine Treffer.

Die einzige kundenspezifische Preis-Logik heute: `BillingPriceList` +
`BillingPriceListEntry`.

#### 3.3 Pro-X-konfigurierte-Preise-Patterns

**`BillingPriceList`** (`prisma/schema.prisma:1442`):
```
id, tenantId, name, description
type         String  VarChar(20) default "sales"   -- discriminator
isDefault    Boolean
validFrom    DateTime?  Date
validTo      DateTime?  Date
isActive     Boolean
```
`type = "sales" | "purchase"` als String-Discriminator. **Kein
separates `PurchasePriceList`/`SalesPriceList`-Modell.**

**`BillingPriceListEntry`** (`prisma/schema.prisma:1471`):
```
id
priceListId   UUID FK
articleId     UUID? FK WhArticle
itemKey       String?                -- Freitext-Schlüssel
description   String?
unitPrice     Float
minQuantity   Float?                 -- Mengen-Staffel
unit          String?
validFrom     DateTime?
validTo       DateTime?
```
**Kein `vatRate`** auf Entries — MwSt liegt nur auf `WhArticle`.

**`lookupPrice`-Funktion** (`src/lib/services/billing-price-list-service.ts:454`):
Chain:
1. Adress-gebundene Liste (`crmAddress.salesPriceListId`) → `articleId`
   oder `itemKey`-Match, mit `minQuantity`-Volume-Break-Tie
   (`:650-675`).
2. Fallback: Tenant-Default-Liste des gleichen Types
   (`isDefault = true`, `:481`).
3. Für Purchase-Lookups Fallback auf `WhArticleSupplier.buyPrice`
   (`:490`).
4. Return `null` wenn nichts gefunden.

**`BillingServiceCase`** (`prisma/schema.prisma:1296`) trägt keine
Preise (`addressId`, `assignedToId`, `invoiceDocumentId` — das war's).

Keine Dateien `price-lookup-service`, `pricing-service`, `rate-service`
in `src/lib/services/` — die Logik lebt ausschliesslich in
`billing-price-list-service.ts:454`.

#### 3.4 `WhArticle`-Pricing

Modell: `prisma/schema.prisma:5500`.

Preis-/MwSt-Felder:
```
unit            VarChar(20)  default "Stk"  @map("unit")              -- :5509
vatRate         Float        default 19.0   @map("vat_rate")          -- :5510
sellPrice       Float?                      @map("sell_price")        -- :5511
buyPrice        Float?                      @map("buy_price")         -- :5512
discountGroup   VarChar(50)?                @map("discount_group")   -- :5513
```

**MwSt ist direkt am Artikel als Float gespeichert.** Default `19.0`
auf DB-Level. Keine VAT-Kategorien, kein Artikeltypen-Derivation.

Kein `listPrice`/`purchasePrice`-Name — die Felder heissen `sellPrice`
und `buyPrice`.

#### 3.5 Anfahrts-Preislogik (km-Satz / Pauschale)

**Im gesamten Schema gibt es KEIN Feld für km-Satz oder Anfahrt-
Pauschale auf Tenant-Ebene.** Geprüft:
- `BillingTenantConfig` (`prisma/schema.prisma:1258`) — enthält
  Briefkopf, Bank, Logo, Tax-IDs, Leitweg-ID, `eInvoiceEnabled`,
  Adresse, `footerHtml`, Kontakt. **Keine Billing-Rate-Config.**
- `SystemSetting` (`prisma/schema.prisma:3737`) — keine VAT- oder
  Travel-Felder.
- `Tenant` — kein `defaultVatRate`, kein Travel-Config.

Verwandte, aber payroll-seitige Modelle:
- `TravelAllowanceRuleSet`, `LocalTravelRule`, `ExtendedTravelRule`
  (`prisma/schema.prisma:4828,4862,4895`) — **Ausloese für Mitarbeiter-
  Reimbursement** unter deutschem Steuerrecht, KEIN Billing-Rate.
- `TripRecord` (`prisma/schema.prisma:4792`) — Tacho-Startet-/Ende-
  Kilometer der Fahrzeugflotte, kein Billing-Bezug.

**`WorkReport.travelMinutes`** speichert Dauer (nicht km). Keine
Spalte für km-Distanz auf `WorkReport` oder `Order`.

Kein Service-File enthält Travel-Billing-Rate-Logik
(`work-report-service.ts` enthält keine price/rate/vat-Referenzen).

#### 3.6 Standard-MwSt pro Tenant

**Existiert nicht.** Geprüft auf `Tenant`, `BillingTenantConfig`,
`SystemSetting` — kein Feld `defaultVatRate` oder `default_vat_rate`
(Schema-Volltextsuche liefert keine Treffer).

VAT-Bestimmung in der Praxis:
- Beim Anlegen einer Position via `billing-document-service.ts:addPosition`
  (Zeile 949) ist `vatRate?: number` ein optionaler Input. Service
  speichert `input.vatRate ?? null` (Zeile 997). **Keine
  Default-Filling-Logik im Service.**
- Default `19.0` existiert einzig auf `WhArticle.vatRate`
  (`prisma/schema.prisma:5510`).
- Frontend verantwortlich, `WhArticle.vatRate` in Position-VAT-Feld
  zu übernehmen (siehe `RecurringPositionEditor`, Default-Wert
  `vatRate: 19` beim Add).

#### 3.7 Aktivitäts-basierte Preise

`Activity` (`prisma/schema.prisma:2535`) hat keine Preis-Felder
(`id, tenantId, code, name, description, isActive, createdAt,
updatedAt`). **Kein `defaultRate`, `billableRate`, `hourlyRate`.**

#### 3.8 Bonus-Befund: `Order.billingRatePerHour`

Nicht im Research-Auftrag explizit angefragt, aber relevant:
`Order.billingRatePerHour` (`prisma/schema.prisma:2575`) existiert:
```
billingRatePerHour  Decimal?  @map("billing_rate_per_hour")  @db.Decimal(10, 2)
```
Auftrags-Ebene-Override für Stundensatz, nullable Decimal(10,2).

#### 3.9 Übersichtstabelle — Was existiert, was nicht

| Primitive | Existiert heute? | Location |
|---|---|---|
| `Employee.hourlyRate` | **Ja**, Decimal? nullable | `prisma/schema.prisma:2182` |
| `Employee.defaultHourlyRate` | Nein | — |
| `CustomerHourlyRate`-Tabelle | **Nein** | — |
| `CrmAddress.salesPriceListId` | Ja | `prisma/schema.prisma:505` |
| `CrmAddress.purchasePriceListId` | Ja | `prisma/schema.prisma:506` |
| `BillingPriceList` + `BillingPriceListEntry` | Ja (Artikel + itemKey, **kein** VAT) | `prisma/schema.prisma:1442, 1471` |
| `lookupPrice()`-Service | Ja | `src/lib/services/billing-price-list-service.ts:454` |
| `WhArticle.vatRate` (Default 19.0) | Ja | `prisma/schema.prisma:5510` |
| Tenant-Default-VAT | **Nein** | — |
| km-Satz / Anfahrt-Pauschale-Billing-Config | **Nein** | — |
| `WorkReport.travelMinutes` (Duration) | Ja | `prisma/schema.prisma:2666` |
| `Activity.defaultRate` | **Nein** | — |
| `Order.billingRatePerHour` | Ja, Decimal? | `prisma/schema.prisma:2575` |

---

### Block 4 — UI-Patterns für Review + Bestätigen

#### 4.1 Review-Dialogs mit Accept/Reject pro Item

**DunningProposalTab** — `src/components/billing/dunning/dunning-proposal-tab.tsx`:
- Zwei State-Container: `selectedGroups: Set<string>` und
  `selectedInvoices: Map<groupId, Set<invoiceId>>`.
- Auto-Selektion beim Laden: alle Gruppen + alle Invoices pre-checked.
- Zwei-Ebenen-Layout: `<Card>` pro Kundengruppe → expandierbar zur
  `<Table>` mit Einzelrechnungen. Pro Ebene eigene `<Checkbox>`.
- Commit: `createRunMutation.mutateAsync({ groups: filtered })`, dann
  `toast.success(t('proposal.createdSuccess', { created, skipped }))`.

**ReorderSuggestionsList** —
`src/components/warehouse/reorder-suggestions-list.tsx`:
- Flacher Single-Row-Checkbox-State: `selected: Set<string>`.
- Per-Row-Disable, wenn kein Supplier zugeordnet.
- Gruppiert beim Commit nach `supplierId`, dann Loop:
  `createFromSuggestions.mutateAsync({ supplierId, articleIds })`
  pro Supplier. Danach `router.push(/warehouse/purchase-orders/<lastPOId>)`.

**PaymentRunsProposalSection** —
`src/components/invoices/payment-runs/proposal-section.tsx`:
- Drei-Status pro Zeile (GREEN/YELLOW/RED) — GREEN sofort wählbar,
  YELLOW expandiert Inline-`<RadioGroup>` für Konflikt-Auflösung vor
  Aktivierung, RED disabled mit Blocker-Anzeige.
- Commit-Button enabled nur, wenn alle selektierten Rows fully resolved.

#### 4.2 Positions-Editor-Komponenten in Billing

**`RecurringPositionEditor`** —
`src/components/billing/recurring-position-editor.tsx`:
- Props: `{ positions: PositionTemplate[]; onChange(...) }`.
- State lebt im Parent (innerhalb React-Hook-Form `useFieldArray`
  o.ä.).
- `PositionTemplate`-Typ:
  ```typescript
  { type: "ARTICLE" | "FREE" | "TEXT";
    articleId?; articleNumber?; description?;
    quantity?; unit?; unitPrice?; flatCosts?; vatRate?; }
  ```
- `calcTotal`-Helper client-seitig: `qty * unitPrice + flatCosts`,
  gerundet.
- CRUD als reine Array-Manipulationen, `onChange(updated)` weiter an
  Parent.

**`DocumentPositionTable`** —
`src/components/billing/document-position-table.tsx`:
- Props: `{ documentId; positions: Position[]; readonly?; addressId? }`.
- Positionen kommen vom Server (Query), nicht lokalem State.
- Add/Update/Delete via einzelne tRPC-Mutations; `useAddBillingPosition`,
  `useUpdateBillingPosition`, `useDeleteBillingPosition`.
- Jedes Feld per `onBlur`-Commit sofort persistiert (kein Batch-Save).
- Beschreibungs-Feld wird `<DescriptionCombobox>` (Popover) mit
  Price-List-Autocomplete, wenn `addressId` gesetzt.
- Nach `description`-Change: `trpc.billing.priceLists.lookupPrice`
  anfragen und `unitPrice` automatisch setzen.
- `totalPrice` vom Server gelesen, nicht client-neu berechnet.

**`ServiceCaseInvoiceDialog`** —
`src/components/billing/service-case-invoice-dialog.tsx`:
- Positions als lokales `useState<Position[]>`.
- Reset bei Dialog-Open.
- Min-Validation: `position.description.trim()` erforderlich.
- Submit: `createInvoiceMutation.mutateAsync({ id, positions:
  validPositions })`, toast, `onInvoiceCreated(invoiceId)` triggert
  `router.push` im Parent.

**`DocumentTotalsSummary`** —
`src/components/billing/document-totals-summary.tsx`:
Stateless, `{ subtotalNet, totalVat, totalGross }` als Props.

#### 4.3 "Generate from X"-Button-Patterns auf Detailseiten

**`GenerateOrderDialog`** —
`src/components/serviceobjects/generate-order-dialog.tsx` (Dialog),
`src/components/serviceobjects/service-object-schedule-tab.tsx`
(Trigger):
```tsx
// In service-object-schedule-tab.tsx
const [generateId, setGenerateId] = React.useState<string | null>(null)
<ScheduleListTable onGenerate={(id) => setGenerateId(id)} />
<GenerateOrderDialog
  scheduleId={generateId ?? ''}
  open={!!generateId}
  onOpenChange={(o) => !o && setGenerateId(null)}
/>
```
Dialog-Handler: `mutateAsync({ id: scheduleId, createInitialAssignment })`,
`toast.success(t("success", { code: result.order.code }))`,
`onOpenChange(false)`, `router.push(/admin/orders/${result.order.id})`.
Hook in `use-service-schedules.ts:128` invalidiert
`trpc.serviceSchedules.list` und `trpc.orders.list`.

**`RecurringGenerateDialog`** —
`src/components/billing/recurring-generate-dialog.tsx`:
- Nutzt `useBillingRecurringInvoicePreview` vor dem Commit.
- Wrappt `<ConfirmDialog>` mit dynamischer Description.
- Handler: `mutateAsync({ id: templateId })`, toast, navigate zu
  `/orders/documents/${result.id}`.

**`ServiceCaseInvoiceDialog`**: als einziger mit editierbarem
Positions-Editor im Dialog (Pattern 4.2).

**`DocumentForwardDialog`** —
`src/components/billing/document-forward-dialog.tsx`:
- `<RadioGroup>` über `FORWARDING_RULES`-Tabelle
  (z. B. `DELIVERY_NOTE → INVOICE`).
- `forwardMutation.mutateAsync({ id, targetType })`, navigate zu
  neuem Dokument.

**Gated-Trigger-Pattern (bei ServiceCase):**
```tsx
{isClosed && !sc.invoiceDocumentId && (
  <Button onClick={() => setShowInvoiceDialog(true)}>
    {t('createInvoice')}
  </Button>
)}
```
Sichtbarkeit abhängig von State + Existenz-Check (`invoiceDocumentId`).

---

### Block 5 — Berechtigungen & Audit

#### 5.1 `billing.*`-Permissions

Datei: `src/lib/auth/permission-catalog.ts:274-310`. Kein singulärer
`billing.*`-Namespace — aufgeteilt in fünf Sub-Resources:

**`billing_documents.*`** (Zeilen 274-279):
- `view`, `create`, `edit`, `delete`, `finalize`
- `finalize` gated auch `confirmStockBookings` + `generateEInvoice`

**`billing_service_cases.*`** (Zeilen 281-285):
- `view`, `create`, `edit`, `delete`

**`billing_payments.*`** (Zeilen 287-290):
- `view`, `create`, `cancel`

**`billing_price_lists.*`** (Zeilen 292-294):
- `view`, `manage`

**`billing_recurring.*`** (Zeilen 296-299):
- `view`, `manage`, `generate`

Enforcement: `src/trpc/routers/billing/documents.ts:13-20,184-199`:
```typescript
const BILLING_CREATE = permissionIdByKey("billing_documents.create")!
const billingProcedure = tenantProcedure.use(requireModule("billing"))

create: billingProcedure
  .use(requirePermission(BILLING_CREATE))
  .input(createInput)
  .mutation(async ({ ctx, input }) => { ... })
```

Alle Billing-Procedures laufen ausserdem durch `requireModule("billing")`
— zusätzlicher Feature-Flag-Guard.

#### 5.2 `work_reports.*`-Permissions

Datei: `src/lib/auth/permission-catalog.ts:268-272`:
- `work_reports.view` — "Arbeitsscheine anzeigen"
- `work_reports.manage` — "Arbeitsscheine erstellen und bearbeiten"
- `work_reports.sign` — "Arbeitsschein signieren"
- `work_reports.void` — "Signierten Arbeitsschein stornieren"

Keine weiteren Keys.

Router-Enforcement: `src/trpc/routers/workReports.ts:29-33,424-426,579-581,622-624`:
- Read-Procedures: `requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE)`
  (OR-Logik via `src/lib/auth/middleware.ts:40-58`).
- Write-Procedures: `requirePermission(WORK_REPORTS_MANAGE)`.
- Sign: `requirePermission(WORK_REPORTS_SIGN)`.
- Void: `requirePermission(WORK_REPORTS_VOID)`.

**WorkReports-Router hat keinen `requireModule`-Guard** — nicht hinter
Feature-Flag eingeklemmt.

#### 5.3 Rollen-Defaults

**Billing** — `supabase/migrations/20260325120000_add_module_permissions_to_groups.sql`:

| Group | billing_documents | billing_service_cases | billing_payments | billing_price_lists | billing_recurring |
|---|---|---|---|---|---|
| ADMIN | (is_admin bypasses) | — | — | — | — |
| PERSONAL | view+create+edit+delete+finalize | view+create+edit+delete | view+create+cancel | view+manage | view+manage+generate |
| BUCHHALTUNG | (identisch zu PERSONAL) | (identisch) | (identisch) | (identisch) | (identisch) |
| VERTRIEB | view only | view only | — | view only | — |
| VORGESETZTER | view only | view only | view only | view only | view only |
| MITARBEITER | — | — | — | — | — |
| LAGER | — | — | — | view only | — |

**Work-Reports** — `supabase/migrations/20260506000002_add_work_report_permissions_to_groups.sql`:

| Group | view | manage | sign | void |
|---|---|---|---|---|
| ADMIN | X | X | X | X |
| PERSONAL | X | X | X | — |
| VERTRIEB | X | X | X | — |
| MITARBEITER | X | X | X | — |
| VORGESETZTER | — | — | — | — |

`void` ist ADMIN-only. Idempotent via `INSERT ... ON CONFLICT DO
UPDATE` bzw. `UPDATE user_groups SET permissions = jsonb_agg(DISTINCT ...)`.

#### 5.4 Audit-Log-Mechanik

Service: `src/lib/services/audit-logs-service.ts`.
Repo: `src/lib/services/audit-logs-repository.ts:85-96`.

`AuditLogCreateInput`:
```typescript
interface AuditLogCreateInput {
  tenantId: string                 // always required — tenant-scoped
  userId: string | null            // null für System-/Cron-Events
  action: string                   // free-form, z. B. "generate_order"
  entityType: string               // z. B. "work_report"
  entityId: string                 // UUID
  entityName?: string | null
  changes?: Record<string, unknown> | null  // via computeChanges()
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}
```

`log()` (Zeilen 173-214):
- Akzeptiert `PrismaClient | Prisma.TransactionClient`.
- Ruft `repo.create()` für tenant-`audit_logs`.
- Bei aktiver Platform-Impersonation (`getImpersonation()`): Dual-Write
  nach `platform_audit_logs` mit `action: "impersonation.<original>"`.
- `console.error` bei Fehlern, never throws. Alle Aufrufer addieren
  zusätzliches `.catch(err => console.error(...))`.
- `logBulk()` (Zeilen 222-257) für Batch via `createMany`.

`computeChanges()` (Zeilen 109-130): Vergleicht Before/After,
normalisiert Date→ISO, Decimal→number, returned `{ field: { old, new } }`
oder `null`.

#### 5.5 "Entity A creates B"-Audit-Muster

**Pattern 1 — Zwei-Einträge mit Cross-Link (T-3 `generate_order`):**

`src/lib/services/service-schedule-service.ts:590-689`, beide Calls
innerhalb der TX:

Entry 1 (auf Schedule):
```typescript
await auditLog.log(tx, {
  action: "generate_order",
  entityType: "service_schedule",
  entityId: scheduleId,
  metadata: {
    generatedOrderId: order.id,
    generatedOrderCode: order.code,
    assignmentCreated: !!assignment,
  },
})
```

Entry 2 (auf Order):
```typescript
await auditLog.log(tx, {
  action: "create",
  entityType: "order",
  entityId: order.id,
  metadata: {
    generatedFromScheduleId: scheduleId,
    generatedFromScheduleName: schedule.name,
  },
})
```

Gegenseitige ID-Referenz über `metadata`.

**Pattern 2 — Ein Eintrag auf Child-Dokument (Forward):**

`src/lib/services/billing-document-service.ts:755-766`, **ausserhalb**
der TX:
```typescript
await auditLog.log(prisma, {
  action: "forward",
  entityType: "billing_document",
  entityId: newDoc.id,        // das NEUE Child-Dokument
  metadata: { forwardedFrom: id, targetType },
})
```
Kein Eintrag auf dem Parent-Dokument. Der Parent-Statuswechsel
zu `FORWARDED` erscheint nur implizit falls ein separates `update`
getriggert wird.

**Pattern 3 — Ein Eintrag auf Source-Template (Recurring):**

`src/lib/services/billing-recurring-invoice-service.ts:497-503`:
```typescript
await auditLog.log(prisma, {
  action: "create",
  entityType: "billing_recurring_invoice",
  entityId: recurringId,       // das Template, nicht die Invoice
  changes: { action: "generate_invoice" },  // ungewöhnlich: Verb im changes
})
```
Kein Audit-Row auf dem generierten `BillingDocument` aus diesem Flow.

**Pattern 4 — Duplicate:**

`src/lib/services/billing-document-service.ts:930-942`:
```typescript
action: "create",
entityType: "billing_document",
entityId: newDoc.id,
metadata: { duplicatedFrom: id },
```

#### 5.6 Billing-spezifische Audit-Action-Strings

`billing-document-service.ts` nutzt:
`"create"` (Create + Duplicate), `"update"`, `"delete"`, `"finalize"`,
`"forward"`, `"cancel"`, plus `entityType: "billing_document_position"`
Varianten für Positions-CRUD.

`billing-recurring-invoice-service.ts` nutzt: `"create"`, `"update"`,
`"delete"`.

`work-report-service.ts`: `"create"`, `"update"`, `"delete"`,
`"sign"`, `"void"`.

`service-schedule-service.ts`: `"generate_order"`, `"record_completion"`.

Konvention: snake_case Zwei-Wort-Actions für Domain-spezifische
Operationen (`generate_order`, `record_completion`, `payment_create`).

---

### Block 6 — Status-Lifecycle und Idempotenz

#### 6.1 WorkReport-Doppel-Generate-Schutz

**`WorkReport` hat keinerlei Invoice-Tracking-Feld.**

Inspiziert (`prisma/schema.prisma:2658-2704`): keine `invoiceId`,
`invoicedAt`, `billingDocumentId`, `alreadyInvoicedAt`,
`invoiceGeneratedAt`.

**`BillingDocument` hat keinen WorkReport-Back-Reference.**

Inspiziert (`prisma/schema.prisma:1102-1190`): Link-Felder
ausschliesslich `inquiryId`, `orderId`, `parentDocumentId`. Kein
`workReportId`, `sourceWorkReportId`, `originWorkReportId`.

**Kein Junction-Table existiert.** Schema-Volltext auf `work_report_id`
findet nur die eine Verwendung: `WhStockMovement.workReportId`
(`prisma/schema.prisma:5740,5752`), die dort Material-Attribution
dient, nicht Billing.

**Konsequenz**: Die Verbindung `WorkReport ↔ BillingDocument` existiert
heute weder als direkter FK noch als Tabelle.

#### 6.2 `WorkReport`-Status-Enum

Definition: `prisma/schema.prisma:663-669`:
```
enum WorkReportStatus { DRAFT, SIGNED, VOID }
```

Transitionen in `src/lib/services/work-report-service.ts`:

**DRAFT → SIGNED** (`sign()`, Zeilen 457-626):
- Pre-Check Zeile 490: `if (existing.status !== "DRAFT") throw new
  WorkReportAlreadySignedError()`.
- Precondition Zeilen 493-503: `workDescription` non-empty,
  `assignments.length >= 1`.
- Atomischer Commit Zeilen 540-551: `updateMany` mit
  `where: { ..., status: "DRAFT" }`. Race-Condition-geschützt — der
  Verlierer sieht `count === 0` und wirft `WorkReportAlreadySignedError`.

**SIGNED → VOID** (`voidReport()`, Zeilen 669-761):
- Pre-Check Zeilen 689-696: DRAFT wirft `WorkReportValidationError`,
  bereits-VOID wirft `WorkReportAlreadyVoidedError`.
- Mindest-Reason-Länge: 10 Zeichen (`MIN_VOID_REASON_LENGTH`, Zeile 635).
- Atomischer Commit Zeilen 701-709: `updateMany` mit `status: "SIGNED"`-Guard.

**DRAFT-Löschung** (`remove()`, Zeilen 364-408):
- Guard Zeile 374: `if (existing.status !== "DRAFT") throw
  WorkReportNotEditableError()`.
- Atomisch Zeile 380: `deleteMany` mit `status: "DRAFT"`.

**VOID ist terminal** — keine Transition zurück. Schema-Kommentar
(`work-report-service.ts:9`): "VOID is a terminal dead-end that
preserves the signed archive."

**DRAFT ist der einzige editierbare Status.** `update()` nutzt
`repo.atomicUpdateDraft()` (Zeile 320) mit `status: "DRAFT"`-Condition.

#### 6.3 BillingDocument-Cancellation-Flow

`cancel()` in `src/lib/services/billing-document-service.ts:783-853`:

```typescript
// Zeilen 794-801
await tx.billingDocument.updateMany({
  where: { id, tenantId, status: { notIn: ["CANCELLED", "FORWARDED"] } },
  data: { status: "CANCELLED" },
})
```

Erlaubt: DRAFT, PRINTED, PARTIALLY_FORWARDED → CANCELLED.
Blockiert: CANCELLED (Conflict), FORWARDED (Validation).

**Keine Source-Entity-Entkopplung beim Cancel.** Nach dem Statuswechsel
macht `cancel()` nur einen Ruf:
`reservationService.releaseReservationsForCancel(prisma, tenantId, id, ...)`
(Zeilen 844-849) — Warehouse-Reservierungen, die bei
`ORDER_CONFIRMATION`-Finalize erzeugt wurden. **Keine FK-Null-Setzung
auf Source-Entities (Orders, ServiceCases, WorkReports).**

**Kein Auto-Create einer Gutschrift** beim Cancel. `cancel()` setzt
`status = "CANCELLED"` und schreibt optional `internalNotes` mit Grund.
Gutschriften werden separat via `forward()`-Pfad erzeugt
(`RETURN_DELIVERY → CREDIT_NOTE`).

#### 6.4 Analoge "One-Shot-Generation"-Patterns

**Pattern A — RecurringInvoice → BillingDocument (transaktionaler
Cursor-Advance):**

`BillingRecurringInvoice`-Modell (`prisma/schema.prisma:1499-1539`)
nutzt:
- `nextDueDate DateTime` — Cursor, advanced bei Generation.
- `lastGeneratedAt DateTime?` — letzter Generation-Zeitpunkt.

In `generate()` (`billing-recurring-invoice-service.ts:387-507`):
```typescript
// Innerhalb $transaction
// 1. template.nextDueDate lesen
// 2. BillingDocument mit documentDate = nextDueDate erzeugen
// 3. nextDue = calculateNextDueDate(template.nextDueDate, template.interval)
// 4. template.update({ lastGeneratedAt: new Date(), nextDueDate: nextDue })
```

Die Query für "due Templates" (`billing-recurring-invoice-repository.ts:151-158`):
```typescript
where: { isActive: true, autoGenerate: true, nextDueDate: { lte: today } }
```
Da `nextDueDate` in derselben TX vorwärts-gerückt wird, verschwindet
das Template aus den Due-Results nach einem erfolgreichen Generate.
**Das ist der One-Shot-Schutz.**

Zusätzlich: **`CronCheckpoint`-Tabelle** (`prisma/schema.prisma:5369-5385`)
als zweite Idempotenz-Ebene für Timeout/Retry.
`@@unique([cronName, runKey, tenantId])`, `upsert` ist idempotent.
Nach jedem Generate schreibt
`/api/cron/recurring-invoices/route.ts:562-584` einen Checkpoint-
Eintrag pro `tenantId:templateId`.

**Pattern B — ServiceSchedule → Order (kein DB-Schutz):**

`ServiceSchedule`-Modell (`prisma/schema.prisma:1031-1075`):
- `nextDueAt DateTime?` — advanced bei Order-Completion, NICHT bei
  Generate.
- `lastCompletedAt DateTime?` — gesetzt, wenn verknüpfte Order
  completed.

`generateOrder()` (`service-schedule-service.ts:590-690`):
- Erzeugt neuen `Order` mit `serviceScheduleId`-Back-Link (Zeile 624).
- **Advance-Null** für `nextDueAt`, `lastCompletedAt`.
- `nextDueAt` wird erst via `order-service.ts:320-336` advanced, wenn
  Order completed wird.

**Konsequenz: kein DB-Level-Guard gegen 2× Generate-Click.** UI ist
die einzige praktische Schranke.

**Pattern C — `WhStockMovement.workReportId`:**

Nullable FK, KEIN Idempotenz-Flag (siehe Block 1.4).

#### 6.5 Status-Preconditions für Downstream-Artefakte

Gefundene Muster:

| Trigger | Source-Status erforderlich | File |
|---|---|---|
| Stock-Booking aus Lieferschein | `PRINTED` | `billing-document-service.ts:1341` |
| Forward in Belegkette | `PRINTED` OR `PARTIALLY_FORWARDED` | `billing-document-service.ts:673` |
| ServiceSchedule `recordCompletion` | Order transition **into** `completed` | `order-service.ts:320` |
| `voidReport` | `SIGNED` | `work-report-service.ts:701` |
| `sign` | `DRAFT` | `work-report-service.ts:490,540` |

Beispiel `createDeliveryNoteStockBookings()`
(`billing-document-service.ts:1341-1345`):
```typescript
if (doc.status !== "PRINTED") {
  throw new BillingDocumentValidationError(
    "Stock bookings can only be created for finalized (PRINTED) documents"
  )
}
```

**Kein existierendes Muster** für "Rechnung kann nur aus Order im
Status X erzeugt werden" — `billing-document-service.create()` akzeptiert
`orderId` als optionales Feld ohne Status-Check.

#### 6.6 WorkReport als Source — architektonische Sauberkeit

Nur `SIGNED` WorkReports aus R-1 heranzuziehen ist architektonisch
konsistent mit den existierenden Patterns (siehe Tabelle oben):
- `SIGNED` ist der "Einfriere"-Status mit atomarem Race-Guard
  (`work-report-service.ts:540-551`).
- `DRAFT` ist semantisch "in Arbeit" und kann sich noch ändern.
- `VOID` ist terminal-stornierte Historie.

---

### Block 7 — i18n, Namespacing, Handbuch

#### 7.1 i18n-Message-Struktur

Dateien:
- `messages/de.json` (primär, deutsch)
- `messages/en.json` (Mirror, englisch)

**97 Top-Level-Namespaces** im `de.json` (File endet bei Zeile 8957).

Für R-1 relevante Top-Level-Namespaces mit ~Zeilennummer:
```
billingDocuments           6640
billingOutgoingInvoiceBook 6806
billingOpenItems           6834
billingPriceLists          6888
billingRecurring           6948
billingServiceCases        7059
billingDunning             7115
billingTemplates           7272
billingPriceListEntries    5995 (separat)
```

**Kein zentraler `billing`-Namespace** — Billing ist auf sieben
prefixed Top-Levels aufgeteilt.

#### 7.2 Second-Level-Keys pro Billing-Namespace

| Namespace | Struktur | Relevante Second-Level-Keys |
|---|---|---|
| `billingDocuments` | flach (keine Sub-Objekte) | Typ-Labels, Status-Labels, CRUD-Form, Belegkette, Forward/Cancel/Duplicate, PDF/XML |
| `billingOutgoingInvoiceBook` | flach | Datum-Filter, Export-Actions |
| `billingOpenItems` | flach | Liste, Payment-Recording |
| `billingPriceLists` | flach | CRUD, Copy, Bulk-Adjust |
| `billingRecurring` | flach | List, Form, CRUD, plus `generateTitle`, `generateDescription`, `generate`, `generateCancel`, `invoiceGenerated`, `generateError`, `generateAllDue`, `generateDueError` |
| `billingServiceCases` | flach | List, Detail, `createOrder*`, `createInvoice` (nur Button-Label; Dialog ohne i18n) |
| `billingDunning` | **deeply nested**: `tabs`, `preFlight`, `proposal`, `runs`, `detail`, `templates`, `settings`, `block` | — |
| `billingTemplates` | flach | — |

#### 7.3 WorkReports-Namespace-Status

**Kein `workReports`/`crmWorkReports`/`adminWorkReports`-Top-Level-
Namespace** existiert in `de.json` oder `en.json`.

`"crmWorkReports"` taucht nur auf Nav-Level auf (`nav.crmWorkReports =
"Arbeitsscheine"`, Zeile 179) — Sidebar-Label, kein Feature-
Namespace.

`"tabWorkReports"` lebt in `adminOrders` (Zeile 5013) — Tab-Label auf
Orders-Detail-Page.

**Die WorkReport-Feature-Komponenten** (`src/components/work-reports/`)
und -Pages (`src/app/[locale]/(dashboard)/admin/work-reports/`)
enthalten **keinerlei `useTranslations`/`getTranslations`-Calls**. Das
gesamte Feature nutzt hartkodierte deutsche Strings.

#### 7.4 Konvention: "Generate X from Y" — Source- oder Target-Namespace?

**Präzedenzfall 1**: `serviceSchedules.generateOrder`
- Dialog: `src/components/serviceobjects/generate-order-dialog.tsx`
- Namespace: `useTranslations("serviceSchedules.generateOrder")` —
  **unter Source-Entity** (Schedule).
- Keys: `button`, `dialogTitle`, `dialogDescription`,
  `createAssignmentCheckbox`, `noResponsibleEmployee`, `confirmButton`,
  `cancel`, `success`, `error`, `goToOrder`.

**Präzedenzfall 2**: `billingRecurring` (generate-Strings)
- Dialog: `src/components/billing/recurring-generate-dialog.tsx`
- Namespace: `useTranslations("billingRecurring")` — **unter Source**
  (Template).
- Keys: `generateTitle`, `generateDescription`, `generate`,
  `generateCancel`, `invoiceGenerated`, `generateError`.

**Präzedenzfall 3**: `billingServiceCases` (`createInvoice`-Button)
- Dialog: `src/components/billing/service-case-invoice-dialog.tsx`
- Dialog selbst ohne `useTranslations`, alle Strings hartkodiert
  deutsch. Nur das auslösende Button-Label liegt in
  `billingServiceCases.createInvoice`.

**Konvention**: Cross-Module-Generate-Flows parken ihre Strings unter
der **Source-Entity** (nicht dem Target).

#### 7.5 Handbuch

Pfad: `docs/TERP_HANDBUCH.md` (Kopie in
`.next/standalone/docs/TERP_HANDBUCH.md` ist Build-Artefakt).

Für R-1 relevante Headings:
```
Line 6112:  ## 12c. Arbeitsscheine — Mobile Einsatzdokumentation mit Signatur
Line 6182:  ### 12c.4 Praxisbeispiel: Arbeitsschein vor Ort erfassen
Line 6204:  ### 12c.5 Praxisbeispiel: Mitarbeiter zu einem Arbeitsschein zuweisen
Line 6399:  ### 12c.9 Praxisbeispiel: Signierten Arbeitsschein stornieren
Line 6465:  ## 13. Belege & Fakturierung
Line 6479:  ### 13.1 Belegtypen
Line 6503:  ### 13.2 Belegliste
Line 6523:  ### 13.3 Beleg anlegen
Line 6590:  ### 13.5 Beleg abschließen (Festschreiben)
Line 6622:  ### 13.6 Beleg fortführen (Belegkette)
Line 6637:  ### 13.7 Beleg stornieren
Line 6644:  ### 13.8 Beleg duplizieren
Line 6726:  ### 13.9 Praxisbeispiel: Angebot bis Rechnung
Line 7445:  ### 13.13 Wiederkehrende Rechnungen
Line 7709:  ### 13.14 E-Rechnung (ZUGFeRD / XRechnung)
Line 7876:  ### 13.16 Rechnungsausgangsbuch (Steuerberater-Export)
```

**WorkReport-Kapitel** (§12c) liegt direkt vor **Billing-Kapitel**
(§13). Die bestehende Struktur:
- §12c.4, §12c.5, §12c.9 = Praxisbeispiele mit step-by-step-Anleitung.
- §13.9 = "Angebot bis Rechnung" existiert als Praxisbeispiel im
  Billing-Kapitel.

---

### Block 8 — Test-Patterns für cross-modul Integrationen

#### 8.1 Service-Layer-Unit-Tests mit Mocked-Prisma (Multi-Model + Cross-Module-Writes)

**Kanonisches Muster**: Inline `createMockPrisma(overrides)` pro
Test-File.

Beispiele:
- `src/lib/services/__tests__/billing-service-case-service.test.ts:92-131`
  — Reads `CrmAddress, CrmContact, CrmInquiry, BillingServiceCase`;
  writes `BillingDocument, BillingDocumentPosition, NumberSequence,
  BillingDocumentTemplate`. `$transaction`-Mock: `fn(prisma)`.
- `src/lib/services/__tests__/billing-document-service.test.ts:127-160`
  — identisches Muster, flache `overrides`.
- `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts:43-80,294-335`
  — nested `overrides: Record<model, Record<method, fn>>` (Variante),
  generate-Pfad inkl. Service-Period-Berechnung.
- `src/lib/services/__tests__/wh-stock-movement-service.test.ts:104-133`
  — Multi-Model (WhPurchaseOrder + Position + Article → Movement).
- `src/lib/services/__tests__/work-report-service.unit.test.ts:58-113`
  — **named-mocks**-Variante: Named `PrismaMocks`-Interface mit
  expliziten `vi.fn()`-References für direkte `expect`-Assertions.

Kern-Snippet (aus `billing-service-case-service.test.ts:92-131`):
```typescript
function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    crmAddress: { findFirst: vi.fn() },
    crmContact: { findFirst: vi.fn() },
    crmInquiry: { findFirst: vi.fn() },
    billingServiceCase: { findMany: vi.fn(), count: vi.fn(), ... },
    billingDocument: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    billingDocumentPosition: {
      findFirst: vi.fn(), create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn(),
    },
    numberSequence: { upsert: vi.fn() },
    billingDocumentTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
    order: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    ...overrides,
  } as unknown as PrismaClient
  ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fnOrArr: unknown) => {
      if (typeof fnOrArr === "function") return (fnOrArr as (tx: unknown) => unknown)(prisma)
      return Promise.all(fnOrArr as unknown[])
    }
  )
  return prisma
}
```

#### 8.2 Real-DB-Integration-Test-Setup

**Guard-Pattern** (alle integration.test-Files):
```typescript
const HAS_DB = Boolean(process.env.DATABASE_URL)
describe.skipIf(!HAS_DB).sequential("work-report-service integration", () => {
```

**Deterministische UUIDs** — Test-Files nutzen feste UUID-Präfixe:
```typescript
const TENANT_A = "77070000-0000-4000-a000-000000007701"
const CUSTOMER_A = "..."
```

**Lifecycle-Patterns** koexistieren:

| Muster | Beispiel | Wann |
|---|---|---|
| `beforeAll` seed + `afterAll` cleanup | `work-report-service.integration.test.ts` | Stabile Fixture, viele Tests auf derselben Datenbasis |
| `beforeEach` cleanup spezifischer Tabellen | `outgoing-invoice-book-service.integration.test.ts` | Tenant/Address bleiben stehen, Dokumente pro-Test |
| `afterEach` mit `Set<tenantId>` + `randomUUID()` pro Test | `overtime-payout-close-flow.integration.test.ts` | Voll-isolierte Tenants pro Test |
| `beforeAll` upsert-bulk + `beforeEach` einzelne Tabelle | `inbound-invoice-service.integration.test.ts` | Mix aus persistent und ephemeral |

**FK-dependency-order Teardown** — Beispiel aus
`work-report-service.integration.test.ts`:
```typescript
async function cleanupFixtures() {
  const ids = { in: [TENANT_A, TENANT_B] }
  await prisma.workReportAttachment.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.workReportAssignment.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.workReport.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.order.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.serviceObject.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.crmAddress.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.employee.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  // ... number-sequences, audit-logs, user-tenants, users, tenants
}
```

**Cross-Service-Komposition im Test-Body**
(`work-report-assignment-service.integration.test.ts:121-181`):
```typescript
async function createDraftReport(description = "Assignment test") {
  return workReportService.create(
    prisma, TENANT_A,
    { orderId: ORDER_A, visitDate: "2026-04-22", workDescription: description },
    { userId: USER_A },
  )
}
it("full add flow: Add → listByWorkReport contains Employee include", async () => {
  const report = await createDraftReport()
  const added = await assignmentService.add(
    prisma, TENANT_A,
    { workReportId: report.id, employeeId: EMPLOYEE_A, role: "Techniker" },
    { userId: USER_A },
  )
  // Assertions inkl. Audit-Row-Check über separate Prisma-Query
})
```

#### 8.3 Fixture-Builders

**Kein zentraler `fixtures.ts`/`factories.ts`/`seed-helpers.ts`/
`test-builders.ts` existiert.** Jedes Test-File definiert eigene
inline-Helper:
- `createDoc(params)` in `outgoing-invoice-book-service.integration.test.ts`
- `createTenantBase(name)`, `createEmployee`, `createTariff` in
  `overtime-payout-close-flow.integration.test.ts`
- `createDraftReport` in `work-report-assignment-service.integration.test.ts`

Plus Object-Factories für Unit-Tests:
- `makeReport(overrides)` in `work-report-service.unit.test.ts:22-54`
- `makeOrder(overrides)` in `orders-router.test.ts:26-63`
- `makeOrderBookingRecord(overrides)` in
  `orderBookings.test.ts:21-40`

#### 8.4 tRPC-Router-Test-Harness

Zentrale Harness: `src/trpc/routers/__tests__/helpers.ts`.

Exports:
- `autoMockPrisma(partial)` — `Proxy`, der fehlende Models/Methoden
  automatisch mit Defaults stubt (`findMany→[]`, `count→0`,
  `updateMany→{count:1}`, sonst `null`). Wrappt `$transaction`.
- `createMockUser(overrides?)` — `ContextUser`.
- `createMockSession()`, `createMockTenant`, `createMockUserTenant(userId, tenantId)`.
- `createMockUserGroup(overrides?)`.
- `createAdminUser(overrides?)` — Short-Circuit via `userGroup.isAdmin = true`.
- `createUserWithPermissions(permissionIds, overrides?)` — vollwertiges
  User mit expliziten Permission-IDs.
- `createMockContext(overrides?)` — gesamter `TRPCContext`.

Kanonisches Setup (aus 80+ Router-Test-Files):
```typescript
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))

const MODULE_MOCK = { tenantModule: { findMany: ..., findUnique: ... } }
function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma, permissions = ALL_PERMS) {
  return createMockContext({
    prisma: withModuleMock(prisma) as ...,
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    tenantId: TENANT_ID,
    authToken: "test-token",
    session: createMockSession(),
  })
}

const createCaller = createCallerFactory(billingDocumentsRouter)
const caller = createCaller(createTestContext(prisma))
const result = await caller.create({ ... })
```

**Permissions NICHT bypassed** — `requirePermission`-Middleware läuft
real durch. Negative-Tests nutzen `createNoPermContext(prisma)` mit
leerem Permission-Array und `.rejects.toThrow("Insufficient permissions")`.

**`tenantId` direkt injiziert** — keine Header-Parsing im Test, weil
tRPC-Caller den HTTP-Adapter umgeht.

---

## Code References

### Block 1 — WorkReport / OrderBooking / WhStockMovement
- `prisma/schema.prisma:663-669` — `WorkReportStatus` enum
- `prisma/schema.prisma:2658-2704` — `WorkReport` Modell
- `prisma/schema.prisma:2706-2724` — `WorkReportAssignment` Modell
- `prisma/schema.prisma:5447-5476` — `OrderBooking` Modell
- `prisma/schema.prisma:5500-5513` — `WhArticle` Modell inkl. `vatRate`
- `prisma/schema.prisma:5740,5752,5760` — `WhStockMovement.workReportId`
- `prisma/schema.prisma:2545-2587` — `Order` Modell (inkl. `billingRatePerHour`)
- `src/lib/services/order-booking-aggregator.ts:17,38` — Aggregate-Funktionen
- `src/lib/services/order-booking-repository.ts:27` — `findMany`-Repo
- `src/lib/services/work-report-assignment-service.ts:107` — Assignment add
- `src/lib/services/wh-stock-movement-service.ts:182` — Wareneingang
- `src/lib/services/wh-withdrawal-service.ts:121,223,320` — Withdrawals
- `src/lib/services/wh-stocktake-service.ts:465` — Inventur-Movement
- `src/lib/services/wh-stock-movement-repository.ts:83-131` — Generic create-Interface

### Block 2 — BillingDocument
- `prisma/schema.prisma:641` — `BillingDocumentType` enum
- `prisma/schema.prisma:653-661` — `BillingDocumentStatus` enum
- `prisma/schema.prisma:671,681` — Position- und Price-Type enums
- `prisma/schema.prisma:1102-1190` — `BillingDocument` Modell
- `prisma/schema.prisma:1199-1223` — `BillingDocumentPosition` Modell
- `prisma/schema.prisma:1258` — `BillingTenantConfig` Modell
- `prisma/schema.prisma:1442,1471` — `BillingPriceList` + Entry
- `prisma/schema.prisma:1499-1539` — `BillingRecurringInvoice` Modell
- `src/lib/services/billing-document-service.ts:105-145` — `recalculateTotals`
- `src/lib/services/billing-document-service.ts:149-161` — `totalPrice` calc
- `src/lib/services/billing-document-service.ts:205-357` — `create`
- `src/lib/services/billing-document-service.ts:525-656` — `finalize`
- `src/lib/services/billing-document-service.ts:658-781` — `forward`
- `src/lib/services/billing-document-service.ts:783-853` — `cancel`
- `src/lib/services/billing-document-service.ts:873-901` — `duplicate`
- `src/lib/services/billing-document-service.ts:949-1025` — `addPosition`
- `src/lib/services/billing-document-service.ts:1324-1444` — `createDeliveryNoteStockBookings`
- `src/lib/services/billing-document-repository.ts:83-125` — Repo-create
- `src/lib/services/billing-document-repository.ts:188-244` — Position-create(many)
- `src/lib/services/billing-recurring-invoice-service.ts:387-507` — `generate`
- `src/lib/services/billing-service-case-service.ts:265-335` — `createInvoice`
- `src/lib/services/number-sequence-service.ts:37-108` — Default-Prefixes + `getNextNumber`
- `src/lib/platform/subscription-autofinalize-service.ts:46-212` — Autofinalize

### Block 3 — Pricing
- `prisma/schema.prisma:481-529` — `CrmAddress` inkl. Price-List-FKs
- `prisma/schema.prisma:1442,1471` — `BillingPriceList*`
- `prisma/schema.prisma:2092,2182` — `Employee` inkl. `hourlyRate`
- `prisma/schema.prisma:2535` — `Activity` Modell
- `prisma/schema.prisma:2575` — `Order.billingRatePerHour`
- `prisma/schema.prisma:4476-4480` — `EmployeeCompensationHistory.hourlyRate`
- `prisma/schema.prisma:4828,4862,4895` — `TravelAllowanceRuleSet*` (Payroll)
- `prisma/schema.prisma:5510` — `WhArticle.vatRate`
- `src/lib/services/billing-price-list-service.ts:454-675` — `lookupPrice`

### Block 4 — UI-Patterns
- `src/components/billing/dunning/dunning-proposal-tab.tsx` — Review-mit-Accept/Reject (2-Ebenen)
- `src/components/warehouse/reorder-suggestions-list.tsx` — Single-Row-Select + Grouped-Commit
- `src/components/invoices/payment-runs/proposal-section.tsx` — 3-Status-Rows mit Inline-Resolver
- `src/components/billing/recurring-position-editor.tsx` — Controlled-Array-Editor
- `src/components/billing/document-position-table.tsx` — Server-Persist per-field onBlur
- `src/components/billing/service-case-invoice-dialog.tsx` — Local-useState-Editor + Create
- `src/components/billing/document-totals-summary.tsx` — Stateless-Totals
- `src/components/serviceobjects/generate-order-dialog.tsx` — Generate-Dialog (Pattern)
- `src/components/serviceobjects/service-object-schedule-tab.tsx` — Trigger-Pattern
- `src/components/billing/recurring-generate-dialog.tsx` — Generate mit Preview
- `src/components/billing/recurring-detail.tsx` — Trigger vom Detail-Page
- `src/components/billing/service-case-detail.tsx` — Gated-Trigger
- `src/components/billing/document-forward-dialog.tsx` — Type-Selection-Dialog
- `src/hooks/use-service-schedules.ts:128` — `useGenerateOrderFromSchedule`
- `src/hooks/use-billing-recurring.ts:104` — `useGenerateRecurringInvoice`

### Block 5 — Permissions & Audit
- `src/lib/auth/permission-catalog.ts:268-272` — `work_reports.*` Keys
- `src/lib/auth/permission-catalog.ts:274-310` — `billing_*` Keys
- `src/lib/auth/middleware.ts:20,40-58` — `requirePermission`, OR-Logik
- `src/lib/services/audit-logs-service.ts:23-27,109-130,173-214,222-257` — `AuditContext`, `computeChanges`, `log`, `logBulk`
- `src/lib/services/audit-logs-repository.ts:29-96` — Where-Builder + Create-Interface
- `src/trpc/routers/workReports.ts:29-33,424-426,579-581,622-624` — Permission-Bindung
- `src/trpc/routers/billing/documents.ts:13-20,184-199` — `billingProcedure` + Bindung
- `src/lib/services/service-schedule-service.ts:590-689` — Dual-Entry-Audit
- `src/lib/services/billing-recurring-invoice-service.ts:497-503` — Single-Entry-Audit
- `src/lib/services/billing-document-service.ts:755-766,930-942` — Forward/Duplicate-Audit
- `src/lib/services/work-report-service.ts:245,350,401,599,741` — WorkReport-Audit-Sites
- `supabase/migrations/20260325120000_add_module_permissions_to_groups.sql` — Billing-Permission-Gruppen
- `supabase/migrations/20260506000002_add_work_report_permissions_to_groups.sql` — WorkReport-Permission-Gruppen

### Block 6 — Idempotenz & Lifecycle
- `prisma/schema.prisma:1499-1539` — `BillingRecurringInvoice` (`nextDueDate`, `lastGeneratedAt`)
- `prisma/schema.prisma:5369-5385` — `CronCheckpoint` Modell
- `prisma/schema.prisma:1031-1075` — `ServiceSchedule` Modell
- `src/lib/services/work-report-service.ts:457-626,669-761,364-408` — sign/void/remove
- `src/lib/services/billing-document-service.ts:673,783-853,1341-1345` — `forward`/`cancel`/`createDeliveryNoteStockBookings`
- `src/lib/services/billing-recurring-invoice-service.ts:387-507,534-544` — `generate` inkl. Checkpoint-Skip
- `src/lib/services/billing-recurring-invoice-repository.ts:146-158` — `findDue`
- `src/lib/services/order-service.ts:320-336` — ServiceSchedule-Transition-Hook
- `src/lib/services/service-schedule-service.ts:590-690,701` — generateOrder/recordCompletion
- `src/app/api/cron/recurring-invoices/route.ts:562-584` — Checkpoint-Write

### Block 7 — i18n & Handbuch
- `messages/de.json` — 97 Top-Level-Namespaces, 8957 Zeilen
- `messages/de.json:179` — `nav.crmWorkReports`
- `messages/de.json:5013` — `adminOrders.tabWorkReports`
- `messages/de.json:6640-7300` — `billing*`-Namespaces
- `docs/TERP_HANDBUCH.md:6112` — §12c Arbeitsscheine
- `docs/TERP_HANDBUCH.md:6465` — §13 Belege & Fakturierung
- `docs/TERP_HANDBUCH.md:6726` — §13.9 Praxisbeispiel: Angebot bis Rechnung

### Block 8 — Test-Patterns
- `src/trpc/routers/__tests__/helpers.ts` — zentrale Harness
- `src/lib/services/__tests__/billing-service-case-service.test.ts:92-131` — Multi-Model Mock
- `src/lib/services/__tests__/billing-document-service.test.ts:127-160` — Standard-Mock
- `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts:43-80,294-335` — Nested overrides
- `src/lib/services/__tests__/work-report-service.unit.test.ts:22-113` — Named-Mocks + makeReport
- `src/lib/services/__tests__/work-report-service.integration.test.ts` — Fixture-Lifecycle
- `src/lib/services/__tests__/work-report-assignment-service.integration.test.ts:121-181` — Cross-Service-Compose
- `src/lib/services/__tests__/outgoing-invoice-book-service.integration.test.ts:37-219` — `createDoc`-Helper
- `src/lib/services/__tests__/order-booking-aggregator.test.ts` — groupBy-Mock
- `src/trpc/routers/__tests__/billingRecurring-router.test.ts` — Router-Test generate
- `src/trpc/routers/__tests__/billingDocuments-router.test.ts` — Router-Test CRUD
- `src/trpc/routers/__tests__/orders-router.test.ts:26-63` — `makeOrder`-Factory

---

## Architecture Documentation

### Service + Repository + Router-Schicht

Die für R-1 relevanten Bereiche folgen dem etablierten
Terp-Architekturmuster:

**Router-Layer** (`src/trpc/routers/`): dünn, Input-Validation via Zod,
Permission-Enforcement via `requirePermission(...)` Middleware, Modul-
Guard via `requireModule(...)` (Billing: ja, WorkReport: nein). Aufruf
geht nach Service.

**Service-Layer** (`src/lib/services/*-service.ts`): Business-Logik,
Cross-Module-Koordination, Transaction-Scope, Audit-Log-Writes,
Error-Wrapping. Services nehmen typischerweise die Signatur
`(prisma, tenantId, input, actorId, audit)`.

**Repository-Layer** (`src/lib/services/*-repository.ts`):
Prisma-Queries, include-Shape-Definitionen, kein Business-Code.

### Zwei Transaktions-Strategien für "Generate Invoice from X"

**A — Repo-Direct + Batch-Positions** (`generate`, `forward`,
`duplicate`):
- Eine flache `$transaction`.
- Umgeht `service.create()`; ruft `repo.create()` + 
  `repo.createManyPositions()` direkt.
- Ein abschliessendes `service.recalculateTotals()`.
- Schneller bei vielen Positionen, aber keine Service-Level-Validation
  (Address-Tenant-Check, Template-Auto-Apply).

**B — Service-Full + Per-Position-addPosition** (`createInvoice` aus
ServiceCase):
- Äussere `$transaction` + genestete `$transaction`s pro
  `addPosition`.
- Volle Service-Validation inklusive Default-Template-Auto-Apply,
  DRAFT-Guard, Sort-Order-Berechnung, inkrementelles Recalculate.
- Kostet mehr DB-Roundtrips, erzwingt aber alle Service-Constraints.

### Audit-Flow-Varianten

Zwei koexistierende Stile für "A erzeugt B":
1. **Zwei Einträge** (auf Source + Target, mit metadata-Cross-Link) —
   `service-schedule-service.generateOrder`.
2. **Ein Eintrag** (nur auf einem der beiden Seiten — entweder
   Target-Side mit `metadata: { sourceId }` für Forward/Duplicate, oder
   Source-Side mit `changes: { action: "generate_invoice" }` für
   Recurring).

### Atomic-Guards

Zwei Patterns im Einsatz:
1. **`updateMany` mit Status-Condition** — Race-Safe Transition
   (siehe `work-report-service.ts:540-551` sign, `:701-709` void,
   `billing-document-service.ts:794-801` cancel).
2. **Pre-Check + Throw** — Nicht Race-Safe, aber ausreichend für
   User-triggered Actions (ServiceSchedule `generateOrder` hat keinen
   Concurrency-Guard).

### Idempotenz-Strategien

1. **Cursor-Advance in TX** (RecurringInvoice `nextDueDate`) —
   Query-Filter schliesst bereits-erzeugte Templates aus.
2. **CronCheckpoint-Table** (separate Idempotenz-Ebene für Cron-
   Retries) — `@@unique([cronName, runKey, tenantId])`, upsert.
3. **Kein Schutz** (ServiceSchedule → Order, Document → Duplicate) —
   UI-Level-Barriere genügt.

### Permission-Struktur

- Billing: fünf Sub-Namespaces mit eigener Verb-Grammatik
  (`view/create/edit/delete/finalize` für Documents, `view/manage` für
  PriceLists, `view/manage/generate` für Recurring).
- WorkReport: vier Keys (view/manage/sign/void), kein Create-Delete-
  Split — `manage` deckt beides.
- Rollen-Mapping in dedizierten SQL-Migrations (`20260325120000`,
  `20260506000002`), idempotent.

### i18n-Konvention

- 97 flache Top-Level-Namespaces.
- Billing fragmentiert in sieben `billing*`-Namespaces.
- Cross-Module-Generate-Strings unter **Source-Namespace**
  (`serviceSchedules.generateOrder.*`, `billingRecurring.generate*`).
- **WorkReport-Feature komplett ohne i18n heute** — hardcoded Deutsch.

### Test-Setup-Zweiteiler

- **Unit** — mocked Prisma mit Inline-`createMockPrisma`, $transaction
  threads same-mock through callback. Pro Service-File individuelle
  Variation (flat vs. nested overrides, named vs. anonymous mocks).
- **Integration** — `describe.skipIf(!HAS_DB).sequential`, deterministische
  UUID-Prefixe, vier Lifecycle-Varianten (beforeAll/afterAll, beforeEach,
  afterEach-Set, Mix). FK-order teardown als Konvention. Inline-Helper
  pro File, kein zentrales Factory-Modul.
- **Router** — `createMockContext` + `createUserWithPermissions`;
  Permissions real durchlaufen, `tenantModule`-Mock für Modul-Guard.

---

## Historical Context (from thoughts/)

### M-1 Plan & Research (WorkReport Grundlage)

- `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md` —
  M-1 Implementation-Plan. R-1 wurde dort bereits als Folge-Feature
  konzeptuell erwähnt (Rechnungs-Übernahme, Anfahrtspauschale,
  Time-and-Material-Positionen). Der Plan hat die
  `WhStockMovement.workReportId`-FK definiert (aber nicht in
  Scanner-Flows verdrahtet).
- `thoughts/shared/research/2026-04-22-workreport-arbeitsschein-m1-codebase-analyse.md` —
  Codebase-Bestandsaufnahme vor M-1, inklusive Analyse von OrderBooking-
  Aggregator und BillingDocument-Architektur als Vor-Arbeit für R-1.
- `thoughts/shared/plans/2026-04-24-workreport-e2e-coverage.md` — E2E-
  Test-Coverage-Plan für das fertige WorkReport-Feature (Phasen 2-4).

### T-2 / T-3 Plan & Research (Order-Booking & generate-order)

- `thoughts/shared/research/2026-04-22-prelaunch-status-audit.md` —
  Prelaunch-Status-Audit, listet T-2 (OrderBooking) und T-3 (generate-
  order) als offene Posten.
- `thoughts/shared/plans/2026-03-08-ZMI-TICKET-249-prisma-schema-corrections-order-bookings.md` —
  Schema-Korrekturen für Order-Bookings (historische Basis).
- `thoughts/shared/plans/2026-03-08-ZMI-TICKET-250-order-bookings-correction-assistant-router.md` —
  Router-Plan für Order-Bookings + Correction-Assistant.
- `thoughts/shared/plans/2026-04-22-serviceobjekte-wartungsintervalle.md` —
  Wartungsintervalle + automatische Service-Order-Generierung (T-3).
- `thoughts/shared/research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md` —
  Research-Grundlage für T-3 inkl. Recurring-Invoice-Generate-Mustern.

### BillingDocument-Architektur

- `thoughts/shared/plans/2026-03-19-billing-document-editor.md` — Editor-
  Plan (Line-Items, Positions, PDF).
- `thoughts/shared/plans/2026-03-19-vorgang-verknuepfung-billing.md` —
  Vorgang (CRM-Case) ↔ Billing-Verknüpfung.
- `thoughts/shared/plans/2026-03-17-ORD_01-belegkette.md` — Belegkette
  (Parent-/Child-Dokumente, `forward`-Flow).
- `thoughts/shared/plans/2026-03-18-ORD_05-wiederkehrende-rechnungen.md` —
  Recurring-Invoice-Feature (direktes Vorbild für R-1's Generate-Pattern).
- `thoughts/shared/research/2026-03-18-ORD_05-wiederkehrende-rechnungen.md` —
  Research-Grundlage Recurring.
- `thoughts/shared/plans/2026-04-18-leistungszeitraum-und-rechnungsausgangsbuch.md` —
  Leistungszeitraum (`servicePeriodFrom/To`) + Rechnungsausgangsbuch.
- `thoughts/shared/research/2026-04-18-rechnungsausgangsbuch.md` —
  Research-Grundlage.
- `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` —
  Platform-Subscription-Billing Phase 10a (Bridge-Pattern).
- `thoughts/shared/plans/2026-03-20-ORD-ERECHNUNG-zugferd-einvoice.md` —
  ZUGFeRD/XRechnung E-Invoice.

### Preis- und Stundensatz-Konzepte

- `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md` —
  enthält M-1-Konzept-Diskussion zu Anfahrt/Stundensatz — **kein
  umgesetztes CustomerHourlyRate-Modell** zum Research-Datum.
- `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_02_KUNDENDIENST.md` —
  Kundendienst-Ticket inkl. Anfahrt als billable Position.
- `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_04_PREISLISTEN.md` —
  Preislisten pro Kunde.
- `thoughts/shared/plans/2026-03-18-ORD_04-preislisten.md` /
  `thoughts/shared/research/2026-03-18-ORD_04-preislisten.md` — Preislisten-
  Implementierung (Grundlage für `BillingPriceList`).
- `thoughts/shared/plans/2026-03-23-WH_02-preislisten.md` /
  `thoughts/shared/research/2026-03-23-WH_02-preislisten.md` — Warehouse-
  Preislisten.
- `thoughts/shared/plans/2026-03-23-WH_01-artikelstamm.md` —
  Article-Stammdaten inkl. `vatRate`.
- `thoughts/shared/tickets/misc/price-list-sales-purchase-separation.md` —
  Sales/Purchase-Trennung.
- `thoughts/shared/tickets/ZMI-TICKET-226-travel-allowance-rules.md` —
  Travel-Allowance (Payroll-Reisekosten, nicht Billing).

### Ältere Regiebericht-Vorgänger (konzeptuell)

- `thoughts/shared/tickets/ZMI-TICKET-152-regiebericht.md` — Regiebericht
  als konzeptueller Vorgänger des WorkReport-Billings (Time-and-Material-
  Field-Report).
- `thoughts/shared/tickets/ZMI-TICKET-154-digitale-unterschriften.md` —
  Digitale Unterschriften (M-1-Vorlage).
- `thoughts/shared/tickets/ZMI-TICKET-155-berichtsvorlagen.md` — Report-
  Templates.
- `thoughts/shared/tickets/ZMI-TICKET-160-nachkalkulation.md` —
  Nachkalkulation inkl. Stundensatz-Referenzen.

---

## Related Research

- `thoughts/shared/research/2026-04-22-workreport-arbeitsschein-m1-codebase-analyse.md`
  — Die primäre Vorarbeit; enthält detaillierte Analyse der Order-,
  File-Upload-, PDF-, Audit-, Immutability-, Permission- und i18n-
  Patterns, die R-1 direkt weiterverwenden wird.
- `thoughts/shared/research/2026-04-22-prelaunch-status-audit.md` —
  Gesamt-Prelaunch-Status mit T-2/T-3 als offenen Posten.
- `thoughts/shared/research/2026-04-22-serviceobjekte-wartungsintervalle-codebase-analyse.md`
  — T-3-Research; Beschreibung des `generateOrder`-Flows als
  Audit-Zwei-Einträge-Pattern-Vorlage.
- `thoughts/shared/research/2026-03-18-ORD_05-wiederkehrende-rechnungen.md`
  — Recurring-Invoice-Research; Pattern-Vorlage für Transaction-Scope
  und Position-Batch-Create.
- `thoughts/shared/research/2026-04-18-rechnungsausgangsbuch.md` —
  BillingDocument-State-Lifecycle-Details.
- `thoughts/shared/research/2026-03-19-billing-vorgang.md` — Billing-
  Verknüpfung-Analyse.
- `thoughts/shared/research/2026-04-10-platform-subscription-billing.md`
  — Bridge-Service-Pattern zwischen zwei Tenants.

---

## Open Questions

Die folgenden Fragen sind explizit aus der Research entstanden, aber
nicht durch Codebase-Befund allein zu beantworten — sie werden durch
einen Planungs-Schritt geklärt:

1. **WorkReport-Booking-Trennschärfe** (Block 1.3): Bei mehreren
   Arbeitsscheinen pro Auftrag ist heute rein über das Datenmodell
   nicht entscheidbar, welche `OrderBooking`-Zeilen zu welchem
   Arbeitsschein gehören. Jeder Generate-Flow muss eine explizite
   Regel wählen (Heuristik via `bookingDate == visitDate` / neue FK
   auf OrderBooking / alles-vom-Auftrag-und-manueller-Abzug).

2. **WhStockMovement.workReportId Schreibpfad** (Block 1.4): FK
   existiert als Schema-Element, wird aber in keinem
   Create-Pfad heute gesetzt. Jede "Materialposition aus WorkReport"-
   Logik benötigt entweder einen Write-Site-Patch im Scanner-
   Terminal-UI (M-1-Follow-up) oder eine alternative Zuordnungs-
   Strategie.

3. **Preis-Lookup-Quelle** (Block 3): Das Scope-Dokument definiert
   "Kunden-Override > Mitarbeiter-Default" — aber weder die
   Kunden-Override-Tabelle (`CustomerHourlyRate`) noch der
   Lookup-Service existieren heute. Die Priorität-Chain sowie die
   Fallback-Semantik (leer → 0 → blockieren?) sind Plan-Fragen.

4. **Anfahrt-Konfigurations-Ebene** (Block 3.5): Das Scope-Dokument
   erwähnt "konfigurierbarer km-Satz ODER Pauschale". `WorkReport`
   speichert nur `travelMinutes` (keine km). Eine Konfiguration müsste
   entweder tenant-weit in `BillingTenantConfig` / `SystemSetting`
   oder neuer Config-Tabelle entstehen.

5. **BillingDocument.addressId-Herleitung** (Block 2.5): `Order` hat
   heute keinen `addressId`-FK (nur Freitext `customer`). Die
   `addressId` muss aus `ServiceObject.customerAddressId` oder
   anderweitig gezogen werden. Fallback-Verhalten, wenn WorkReport
   keinen `serviceObjectId` hat, ist zu definieren.

6. **Idempotenz-Kopplung** (Block 6): Kein heutiges Feld verbindet
   `WorkReport` und `BillingDocument`. Ob das Feld auf `WorkReport`
   (`invoiceDocumentId`) oder auf `BillingDocument` (`workReportId`)
   sitzt — oder beide — ist eine Schema-Design-Entscheidung mit
   Konsequenzen für Storno-Entkopplung.

7. **Einer-vs-zwei-Audit-Einträge-Stil** (Block 5.5): T-3 nutzt zwei
   Einträge mit Cross-Link. Recurring nutzt einen. Beide Patterns
   sind etabliert. Die Wahl ist Plan-Entscheidung.

8. **i18n-Entscheidung** (Block 7.4): Die Konvention spricht für
   Source-Namespace (`workReports.generateInvoice.*`). Aber der
   WorkReport-Feature nutzt heute **gar kein** i18n — das würde R-1
   entweder zum Einführungspunkt machen oder das Feature bliebe
   hartkodiert-deutsch wie M-1.

9. **Positions-Editor-Wiederverwendung** (Block 4.2): Drei bestehende
   Editor-Komponenten mit drei State-Strategien (Server-Sync,
   Controlled-Array, Local-useState). R-1 braucht einen Review-
   Editor, der zwischen "erzeugte Vorschläge" und "bearbeitbarer
   DRAFT" differenziert. Keine existierende Komponente passt 1:1.
