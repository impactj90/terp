---
date: 2026-04-29T10:43:46+02:00
researcher: tolga
git_commit: 170922fc
branch: staging
repository: terp
topic: "NK-1 Einzelauftrag-Nachkalkulation (Soll/Ist auf Auftragsebene) — Codebase-Bestandsaufnahme"
tags: [research, codebase, nachkalkulation, nk-1, order, orderbooking, workreport, billing, warehouse, inbound-invoice, datev, surcharges, tenant-module, service-object, contract]
status: complete
last_updated: 2026-04-29
last_updated_by: tolga
---

# Research: NK-1 Einzelauftrag-Nachkalkulation — Codebase-Bestandsaufnahme

**Date**: 2026-04-29T10:43:46+02:00
**Researcher**: tolga
**Git Commit**: 170922fc
**Branch**: staging
**Repository**: terp

## Research Question

Den aktuellen Stand der Datenflüsse rund um Auftrag → Stunden → Material →
Reisezeit → Eingangsrechnungen dokumentieren, um den Plan für
NK-1-Implementierung sauber bauen zu können. Außerdem die
Erweiterungspunkte für NK-2+ identifizieren, damit das NK-1-Datenmodell
die Vertragsebene später ohne Migrations-Schmerz andocken lässt.

**Reine Dokumentation, keine Evaluation, kein Schema-Vorschlag, kein
Migrations-Entwurf.** Plan kommt im nächsten Schritt.

## Summary

Der Codebase-Stand vom 2026-04-29 enthält die meisten Datenquellen, die
NK-1 für Ist-Aggregation braucht — aber **keinerlei dedizierte
Soll-Felder am Auftrag** und **keine Aggregations-Schicht über Lohn,
Material und Eingangsrechnungen hinweg**. Konkret:

- **Order-Modell** (`prisma/schema.prisma:2569–2608`) trägt heute genau
  ein einziges Soll-relevantes Feld: `billingRatePerHour Decimal?`. Es
  gibt keine Felder für geplante Stunden, geplantes Material, geplante
  Reisezeit, kalkulatorische Sollzeit oder Pauschalpreis.

- **OrderBooking** (`prisma/schema.prisma:5452–5484`) erfasst
  Ist-Stunden als einzige Integer-Spalte `timeMinutes` (kein
  Start/Ende, keine Reisezeit-Spalte, keine Schicht-Zuordnung). Die
  Lohnsatz-Lookup-Kette wird nicht beim Anlegen der Buchung, sondern
  erst beim Generieren einer Rechnung im
  `work-report-invoice-bridge-service.ts` ausgeführt.

- **WorkReport** (`prisma/schema.prisma:2661–2709`) trägt die
  Reisezeit als einziges Feld `travelMinutes Int?` auf der
  Kopfebene — keine Granularität pro Buchung. Status-Lifecycle:
  `DRAFT → SIGNED → VOID`.

- **R-1 Bridge-Service**
  (`src/lib/services/work-report-invoice-bridge-service.ts`) ist die
  einzige existierende Aggregations-Logik im Codebase. Strukturell
  baut er aus `OrderBooking[workReportId=X]`-Zeilen und
  `WorkReport.travelMinutes` Vorschlags-Positionen. Lookup-Kette für
  Stundensatz: `Order.billingRatePerHour → Employee.hourlyRate → null`
  (mit `requiresManualPrice` Flag bei null).

- **WhStockMovement** (`prisma/schema.prisma:5731–5770`) hat ein
  nullable `orderId`-FK-Feld als reine SQL-Spalte (ohne Prisma
  `@relation`). **Es gibt kein Preis-/Bewertungsfeld auf der
  Bewegung selbst** — Material wird nicht zum Buchungszeitpunkt
  bewertet, sondern nur live gegen den aktuellen `WhArticle.buyPrice`
  joinbar (kein moving-average, kein WAC).

- **InboundInvoice** (`prisma/schema.prisma:6343–6413`) erlaubt
  Order-Zuordnung **nur auf Kopfebene**, einmalig pro Beleg, beide
  FKs (`orderId`, `costCenterId`) optional. **Es existiert keine
  Doppelzuordnungs-Prüfung** zwischen `WhStockMovement` und
  `InboundInvoice`.

- **Lohngruppen existieren nicht als Entity**. `Employee.hourlyRate`
  ist eine flache Decimal-Spalte; `salaryGroup String?` ist Freitext
  ohne FK. Tariff-Modell ist Arbeitszeit-Konfiguration, kein
  Rate-Träger.

- **DATEV-Zuschlags-Pattern** (`DayPlanBonus` →
  `DailyAccountValue.source="surcharge"`) ist eine vollständig
  ausgearbeitete bedingte-Sätze-Engine, aber arbeitet nur in
  Minuten-Konten, nicht in EUR.

- **Vertrags-Entität existiert nicht** — kein `Contract`,
  `ServiceContract`, `MaintenanceContract` etc. im Schema. Order hat
  kein `contractId`-Feld. Das nächste verwandte Pattern ist
  `BillingRecurringInvoice` (eigene JSONB-Position-Templates, ohne
  Order-Bezug).

- **TenantModule-Gating** ist via `requireModule(...)`-Middleware
  pattern-konsistent ausgebaut. Modul-Katalog steht in
  `src/lib/modules/constants.ts` als `as const`-Array (heute 7
  Werte).

- **Datenqualitäts-Risiken** sind weitgehend nicht abgefangen —
  Buchungen ohne Stundensatz werden lautlos akzeptiert,
  Materialbewegungen tragen keine Bewertung, Eingangsrechnungen
  ohne Order-Zuordnung sind valide, `WorkReport.status`-Filterung
  beim Aggregieren liegt heute nicht standardmäßig in den
  Repository-Funktionen.

## Detailed Findings

### 1. Order-Domäne (Auftrag) — die zentrale Entität

#### Prisma-Modell (`prisma/schema.prisma:2569–2608`)

Vollständige Feldliste:

| Feld | Prisma-Typ | DB-Typ | Default |
|---|---|---|---|
| `id` | `String @id` | `uuid` | `gen_random_uuid()` |
| `tenantId` | `String` | `tenant_id uuid` | — |
| `code` | `String` | `varchar(50)` | — |
| `name` | `String` | `varchar(255)` | — |
| `description` | `String?` | `text` | NULL |
| `status` | `String` | `varchar(20)` | `"active"` |
| `customer` | `String?` | `varchar(255)` | NULL — **Freitext, kein FK** |
| `costCenterId` | `String?` | `cost_center_id uuid` | NULL |
| `billingRatePerHour` | `Decimal?` | `decimal(10,2)` | NULL |
| `validFrom` | `DateTime?` | `date` | NULL |
| `validTo` | `DateTime?` | `date` | NULL |
| `isActive` | `Boolean` | `bool` | `true` |
| `createdAt` | `DateTime` | `timestamptz(6)` | `now()` |
| `updatedAt` | `DateTime @updatedAt` | `timestamptz(6)` | `now()` |
| `serviceObjectId` | `String?` | `uuid` | NULL |
| `serviceScheduleId` | `String?` | `uuid` | NULL |

DB-CHECK-Constraint (nicht in Prisma modelliert): `status IN ('planned',
'active', 'completed', 'cancelled')`.

**Indizes:**
```
@@unique([tenantId, code], map: "orders_tenant_id_code_key")
@@index([tenantId], map: "idx_orders_tenant")
@@index([tenantId, isActive], map: "idx_orders_tenant_active")
@@index([tenantId, status], map: "idx_orders_tenant_status")
@@index([costCenterId], map: "idx_orders_cost_center")
@@index([tenantId, serviceObjectId], map: "idx_orders_tenant_service_object")
@@index([tenantId, serviceScheduleId], map: "idx_orders_tenant_service_schedule")
@@map("orders")
```

**Forward-Relations** auf `Order`: `tenant` (Cascade), `costCenter?`
(SetNull), `serviceObject?` (SetNull), `serviceSchedule?` (SetNull,
Relation `"ServiceScheduleOrders"`).

**Back-Relations (Modelle mit FK auf Order)** — relevant für
Aggregations-Quellen:

| Back-Reference auf `Order` | Source-Modell | FK-Spalte | OnDelete |
|---|---|---|---|
| `assignments` | `OrderAssignment` | `order_id` | Cascade |
| `defaultForEmployees` | `Employee` (Relation `"EmployeeDefaultOrder"`) | — | — |
| `orderBookings` | `OrderBooking` | `order_id` | Cascade |
| `crmInquiries` | `CrmInquiry` | `order_id` | SetNull |
| `billingDocuments` | `BillingDocument` | `order_id` | SetNull |
| `billingServiceCases` | `BillingServiceCase` | `order_id` | SetNull |
| `inboundInvoices` | `InboundInvoice` | `order_id` | SetNull |
| `workReports` | `WorkReport` | `order_id` | Cascade |

**Ausnahme**: `WhStockMovement` hat eine bare `orderId String? @map("order_id")`-Spalte
(`prisma/schema.prisma:5744`), aber **keine Prisma `@relation`** — es ist
ein DB-Level-FK, der in der Prisma-Relation nicht auftaucht. Daher fehlt
auch `stockMovements`-Back-Reference auf `Order`.

**Felder, die heute als Soll-Werte interpretierbar wären**:

- `billingRatePerHour` — der einzige existierende Rate-Träger; Soll-Erlös
  pro Stunde
- `validFrom` / `validTo` — geplantes Zeitfenster

Es gibt **keine** dedizierten Felder für: geplante Stunden je
Lohngruppe, geplantes Material, geplante Reisezeit, Pauschalpreis,
kalkulatorische Sollzeit, geplanter Deckungsbeitrag, Budget.

#### Services (`src/lib/services/order-service.ts` + `order-repository.ts`)

Service-Funktionssignaturen (verbatim):

```typescript
// order-service.ts:69
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; status?: string; serviceObjectId?: string }
)

// order-service.ts:89
export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    code: string
    name: string
    description?: string
    status?: string
    customer?: string
    costCenterId?: string
    billingRatePerHour?: number
    validFrom?: string
    validTo?: string
    serviceObjectId?: string | null
  },
  audit?: AuditContext
)

// order-service.ts:174
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    code?: string
    name?: string
    /* ...alle Felder als Optionals */
    isActive?: boolean
    serviceObjectId?: string | null
  },
  audit?: AuditContext
)

// order-service.ts:347
export async function remove(prisma, tenantId, id, audit?)
```

**Business-Invarianten in `create`** (Zeilen 107–171):
- `code`/`name` werden getrimmt; leer → `OrderValidationError`
- `code`-Eindeutigkeit pro Tenant via `repo.findByCode`; Duplikat → `OrderConflictError`
- `serviceObjectId` wird tenant-scoped existenz-validiert
- `status` default `"active"`, `isActive` immer hartcodiert `true` bei Create

**Business-Invarianten in `update`** (Zeilen 192–345):
- Bei Status-Wechsel auf `"completed"` und gesetztem
  `serviceScheduleId`: `serviceScheduleService.recordCompletion`
  wird aufgerufen (außerhalb Transaktion, Fehler werden geschluckt
  mit `console.warn`).

#### tRPC-Router (`src/trpc/routers/orders.ts:137–271`)

Alle Prozeduren via `tenantProcedure` mit `requirePermission(orders.manage)`.

| Prozedur | Typ | Input |
|---|---|---|
| `list` | query | `{ isActive?, status?(max50), serviceObjectId?(uuid) }?` |
| `getById` | query | `{ id: string }` |
| `create` | mutation | `createOrderInputSchema` |
| `update` | mutation | `updateOrderInputSchema` |
| `delete` | mutation | `{ id: string }` |

`createOrderInputSchema` (Zeilen 61–72):
```typescript
z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  status: z.string().max(50).optional(),
  customer: z.string().max(255).optional(),
  costCenterId: z.string().optional(),
  billingRatePerHour: z.number().min(0).max(999999.99).optional(),
  validFrom: z.string().date().optional(),
  validTo: z.string().date().optional(),
  serviceObjectId: z.string().uuid().nullable().optional(),
})
```

`orderOutputSchema` (Zeilen 38–55) gibt **nicht** `serviceScheduleId`
heraus — das Feld ist DB-persistiert, aber tRPC-API-versteckt.

#### UI-Form (`src/components/orders/order-form-sheet.tsx`)

`FormState` (Zeilen 64–76) enthält: `code`, `name`, `description`,
`status`, `customer`, `costCenterId`, `billingRatePerHour`, `validFrom`,
`validTo`, `isActive`, `serviceObjectId`. **Keine** Budget-/Plan-Felder.

Sektionen:
- **Section 1 — Basic Information** (Zeilen 252–362): code, name,
  description, status, customer, cost center, service object
- **Section 2 — Billing** (Zeilen 364–380): nur `billingRatePerHour` als
  `<Input type="number" step="0.01">`
- **Section 3 — Validity Period** (Zeilen 382–408): validFrom, validTo
- **Section 4 — Status** (Zeilen 410–432, edit-only): isActive

Das Section-2-Container (Billing) wäre der natürliche Andock-Punkt für
zusätzliche Soll-Eingabefelder, oder ein neues Section-Container in
demselben äußeren `<div className="space-y-6 py-4">`-Wrapper.

---

### 2. OrderBooking — Ist-Stunden-Erfassung

#### Prisma-Modell (`prisma/schema.prisma:5452–5484`)

```
id           String   @id
tenantId     String   @map("tenant_id")
employeeId   String   @map("employee_id")
orderId      String   @map("order_id")              -- NOT NULL
activityId   String?  @map("activity_id")
workReportId String?  @map("work_report_id")
bookingDate  DateTime @map("booking_date") @db.Date  -- nur Tag, keine Uhrzeit
timeMinutes  Int      @map("time_minutes")           -- einzige Zeit-Spalte
description  String?
source       String   @default("manual")             -- "manual" | "auto"
createdAt    DateTime
updatedAt    DateTime @updatedAt
createdBy    String?  @map("created_by")
updatedBy    String?  @map("updated_by")
```

**Beobachtungen zur Zeit-Erfassung**:
- Es gibt **keine** Start/End-Timestamps; nur `timeMinutes` als Integer-Summe.
- Es gibt **keine** separate Reisezeit-Spalte auf `OrderBooking` —
  Reisezeit lebt ausschließlich auf `WorkReport.travelMinutes`.
- Es gibt **keine** `Shift`-Relation und kein `shiftId` — keine direkte
  Schicht-Zuordnung am `OrderBooking`.
- `bookingDate` ist `@db.Date` (Tag, keine Uhrzeit). DATEV-Zuschlags-
  Logik kann darauf nicht direkt angewendet werden, weil keine Uhrzeit-
  Information vorhanden ist.

**Source-Werte beobachtet**:
- `"manual"` — Router-Create (`orderBookings.ts:429`)
- `"auto"` — `daily-calc.ts:1006–1008` bei `NO_BOOKING_TARGET_WITH_ORDER`-Verhalten

**Indizes** — keine `@@unique`-Constraints; sieben Composite-Indizes
inklusive `[tenantId, workReportId]` und `[tenantId, orderId, bookingDate]`.

#### Services

`src/lib/services/order-booking-service.ts:create` (Zeilen 67–139)
verifiziert nur Existenz von Employee/Order/Activity (alle tenant-scoped)
und schreibt die Buchung mit dem rohen `timeMinutes`-Wert. **Keine
Stundensatz-Auflösung beim Create**.

`src/lib/services/order-booking-service.ts:update` (Zeilen 141–265):
beim Setzen von `workReportId` wird validiert, dass der referenzierte
`WorkReport` (a) im selben Tenant lebt, (b) zum selben `orderId`
gehört, (c) `status: "DRAFT"` hat (Zeilen 207–220). Sonst:
`OrderBookingValidationError("Arbeitsschein muss DRAFT sein und zum
gleichen Auftrag gehören")`.

`src/lib/services/order-booking-aggregator.ts` (Zeile 17ff.) liefert
zwei Funktionen via `prisma.orderBooking.groupBy`:

```typescript
export async function getBookingSummaryByOrder(
  prisma, tenantId, orderId
): Promise<OrderBookingSummary>

export async function getBookingSummariesByOrders(
  prisma, tenantId, orderIds[]
): Promise<Map<string, OrderBookingSummary>>
```

Output: `{ orderId, totalMinutes, bookingCount, lastBookingDate }`. Das
ist die **einzige existierende Order-Aggregation** auf Buchungsbasis.
Sie summiert nur Minuten — keine Kostenwerte, keine Lohnsatz-Multiplikation.

#### tRPC-Router (`src/trpc/routers/orderBookings.ts`)

Permissions: `list`/`getById` → `order_bookings.view`,
`create`/`update`/`delete` → `order_bookings.manage`. Alle mit
`applyDataScope()`-Middleware.

`createInputSchema` (Zeilen 102–110):
```typescript
z.object({
  employeeId: z.string(),
  orderId: z.string(),
  activityId: z.string().optional(),
  workReportId: z.string().nullable().optional(),
  bookingDate: z.string().date(),
  timeMinutes: z.number().int().min(1).max(1440),  // 1 Min – 24h
  description: z.string().max(2000).optional(),
})
```

#### Lohnsatz-Lookup-Chain (zum Buchungs-Zeitpunkt)

**Es gibt keinen Lookup beim Anlegen einer OrderBooking**. Der
Stundensatz wird ausschließlich in
`work-report-invoice-bridge-service.ts:resolveLaborRate()` (Zeilen
192–201) ausgewertet — und das passiert beim Generieren einer Rechnung,
nicht beim Buchen:

```typescript
function resolveLaborRate(
  orderRate: unknown,
  employeeRate: unknown,
): number | null {
  const order = toPositiveRate(orderRate)
  if (order !== null) return order
  const employee = toPositiveRate(employeeRate)
  if (employee !== null) return employee
  return null
}
```

`toPositiveRate` (Zeilen 179–184) behandelt `null`, `0` und negative
Werte alle als `null`. Wenn beide null sind: `unitPrice = 0`,
`requiresManualPrice = true` auf der Vorschlags-Position.

**Es gibt keinen Snapshot des Stundensatzes auf der OrderBooking-Zeile**.
Eine Lohnerhöhung am Employee verändert retroaktiv alle historischen
Kostenberechnungen (live-Lookup, kein `hourlyRateAtBooking`-Feld).

#### Schicht-/Surcharge-Pattern (DATEV)

Surcharges arbeiten nicht auf `OrderBooking`, sondern auf der
**Time-Tracking-`Booking`-Domäne** (Terminal-Stempelung). Die Pipeline:

`DayPlanBonus` (`prisma/schema.prisma:3147–3168`):
```
id, dayPlanId, accountId,
timeFrom Int (Minuten ab Mitternacht),
timeTo Int,
calculationType String       -- "fixed" | "per_minute" | "percentage"
valueMinutes Int,
minWorkMinutes Int?,          -- Gate
appliesOnHoliday Boolean,
sortOrder Int
```

Ablauf in `daily-calc.ts:postSurchargeValues()` (Zeilen 1649–1729):
1. `convertBonusesToSurchargeConfigs` (`daily-calc.helpers.ts:409–424`)
2. `splitOvernightSurcharge` (`surcharges.ts:106–126`) — `timeFrom >=
   timeTo` (z.B. 22:00–06:00) wird in zwei Same-Day-Fenster aufgespalten
3. `extractWorkPeriods` (`surcharges.ts:165–193`) — Booking-Pairs
   (Stempelungen) → `TimePeriod[]`
4. `calculateSurcharges` (`surcharges.ts:31–95`) mit Holiday/Workday-Gate,
   `minWorkMinutes`-Gate, Overlap-Berechnung pro Period+Config
5. Aggregation pro `accountId`, Upsert in `DailyAccountValue` mit
   `source = "surcharge"`

Surcharges werden in **Minuten-Konten** geführt (`Account` mit
`payrollCode` als DATEV-Lohnart), nicht in EUR. Konversion zu Geld
passiert erst in der DATEV-Export-Pipeline (`payroll-export-service.ts:137–193`).

---

### 3. WorkReport (M-1) — Arbeitsschein als Datenquelle

#### Modell (`prisma/schema.prisma:2661–2709`)

```
id                String           @id
tenantId          String
orderId           String                                    -- NOT NULL
serviceObjectId   String?                                   -- nullable
code              String           @db.VarChar(50)
visitDate         DateTime         @db.Date
travelMinutes     Int?                                       -- *einzige Reisezeit-Quelle*
workDescription   String?          @db.Text
status            WorkReportStatus @default(DRAFT)
signedAt          DateTime?
signedById        String?
signerName        String?
signerRole        String?
signerIpHash      String?
signaturePath     String?
pdfUrl            String?
voidedAt          DateTime?
voidedById        String?
voidReason        String?
createdAt / updatedAt / createdById
```

**Status-Enum** (`prisma/schema.prisma:663–669`):
```prisma
enum WorkReportStatus {
  DRAFT
  SIGNED
  VOID
}
```

State-Lifecycle:
- `DRAFT`-Initialzustand (explizit `@default(DRAFT)` auf Zeile 2672).
- `DRAFT → SIGNED` via `sign`-Prozedur, fordert `workDescription` und
  ≥1 `WorkReportAssignment`.
- `SIGNED → VOID` via `void`-Prozedur. **VOID ist terminal** — keine
  Rückkehr zu DRAFT.
- DRAFT darf gelöscht werden; SIGNED und VOID nicht.

**Verbindungen**:
- `Order` (n:1, NOT NULL): `WorkReport.orderId`
- `OrderBooking` (1:n, optional): `OrderBooking.workReportId` ist die
  FK; auf `WorkReport` ist das `bookings OrderBooking[]`-Backref. Eine
  Buchung wird "an einen Schein getaggt" durch Setzen dieser FK.
- `ServiceObject` (n:1, optional): `WorkReport.serviceObjectId`. Wenn
  gesetzt, ist `serviceObject.customerAddressId` **immer non-null**
  (CrmAddress-FK ist auf `ServiceObject` Pflicht-Feld).
- `WhStockMovement` (1:n, optional): über `workReportId` —
  Lagerbewegung kann an Schein geknüpft werden.
- `BillingDocument` (1:n, optional): Rechnungen, die aus dem Schein
  generiert wurden.

#### Reisezeit

Reisezeit wird **ausschließlich auf `WorkReport`** als
`travelMinutes Int?` (Zeile 2669) erfasst — eine einzige Spalte pro
Schein, keine Granularität pro Buchung oder pro Mitarbeiter. Validierung
im Router: `z.number().int().min(0).max(1440)` (max 24 Stunden pro
Schein, `workReports.ts:272, 279`).

#### Router-Prozeduren (`src/trpc/routers/workReports.ts:358ff.`)

| Prozedur | Typ | Permission |
|---|---|---|
| `list`, `getById`, `listByOrder`, `listByServiceObject` | query | VIEW \| MANAGE |
| `create`, `update`, `delete` | mutation | MANAGE |
| `downloadPdf` | mutation | VIEW \| MANAGE |
| `sign` | mutation | SIGN |
| `void` | mutation | VOID |
| `previewInvoiceGeneration` | query | VIEW \| MANAGE |
| `generateInvoice` | mutation | (VIEW \| MANAGE) AND CREATE |

Sub-Router: `assignments` (list/add/remove), `attachments`
(list/getUploadUrl/confirmUpload/getDownloadUrl/remove).

---

### 4. Material-Bewegungen — Ist-Material

#### `WhStockMovement` (`prisma/schema.prisma:5731–5770`)

```
id                       String              @id
tenantId                 String
articleId                String
type                     WhStockMovementType
quantity                 Float
previousStock            Float
newStock                 Float
date                     DateTime

purchaseOrderId          String?              -- bei GOODS_RECEIPT
purchaseOrderPositionId  String?
documentId               String?
orderId                  String?              -- bei WITHDRAWAL (FK SQL-only)
inventorySessionId       String?
machineId                String?
serviceObjectId          String?
workReportId             String?

reason                   String?
notes                    String?
```

**Enum** (`prisma/schema.prisma:5620–5629`):
```
enum WhStockMovementType {
  GOODS_RECEIPT
  WITHDRAWAL
  ADJUSTMENT
  INVENTORY
  RETURN
  DELIVERY_NOTE
}
```
Keine `CONSUMPTION`- oder `TRANSFER`-Variante. `DELIVERY_NOTE` wird in
allen Service-Queries äquivalent zu `WITHDRAWAL` behandelt
(`{ in: ["WITHDRAWAL", "DELIVERY_NOTE"] }`).

**FK auf Order**: nur als bare SQL-Spalte (`orderId String? @map("order_id")`,
Zeile 5744). **Es gibt weder eine Prisma `@relation` zum Order auf
`WhStockMovement` noch ein `stockMovements`-Backref auf `Order`**. Der
Constraint existiert nur in der SQL-Migration.

**FK auf WorkReport**: vollständig bidirektional (`workReportId String?` +
`@relation(...)` Zeile 5760, Backref `WorkReport.stockMovements
WhStockMovement[]` auf `WorkReport`-Zeile 2699).

#### Bewertung — keine vorhanden auf Bewegungs-Ebene

**Es existiert kein Preis-/Bewertungsfeld auf `WhStockMovement`** — keine
`unitCost`, `totalCost`, `valuationPrice` oder ähnliches. Es gibt auch
keinen separaten `WhStockValuation`-Modell.

Der Preis lebt auf `WhArticle.buyPrice Float?`
(`prisma/schema.prisma:5520`) — das ist eine **statische Stammdaten-
Spalte**, die nicht durch Wareneingänge oder Verbrauch aktualisiert
wird. Es gibt auch `WhArticleSupplier.buyPrice` (`prisma/schema.prisma:5583`)
als per-Supplier-Variante.

**Bei Goods-Receipt**: `wh-stock-movement-service.ts:bookGoodsReceipt`
(Zeilen 112–270) schreibt nur `quantity`, `previousStock`, `newStock`,
`purchaseOrderId`, `purchaseOrderPositionId` — **kein Preis aus
`WhPurchaseOrderPosition.unitPrice` wird in die Bewegung übertragen**.

**Bei Withdrawal**: `wh-withdrawal-service.ts:createWithdrawal` (Zeilen
80–175) schreibt ebenfalls keinen Preis. Withdrawal-Quantity wird als
negativer Float gespeichert (`-input.quantity`, Zeilen 122–123, 222–223).

Die **einzige Stelle mit Preis-Aggregation**: `wh-article-repository.ts:getStockValueSummary`
(Zeilen 501–523), eine Raw-SQL-Abfrage für Tenant-weiten Bestandswert:
```sql
SUM(current_stock * COALESCE(buy_price, 0))
```
— nicht per-Movement, nicht per-Order.

**Kein moving-average / WAC-Mechanismus**.

#### Material-Aggregation per Order

Existierende Funktion `wh-withdrawal-service.ts:listByOrder` (Zeilen
478–492):

```typescript
export async function listByOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
) {
  return prisma.whStockMovement.findMany({
    where: { tenantId, type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] }, orderId },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
    },
    orderBy: { date: "desc" },
  })
}
```

Die `select`-Klausel inkludiert **bewusst nicht** `buyPrice`. Exposure
über tRPC: `warehouse.withdrawals.listByOrder`
(`src/trpc/routers/warehouse/withdrawals.ts:152–165`), gated von
`WH_STOCK_VIEW`.

**Es existiert keine Funktion, die Materialkosten (quantity × buyPrice)
pro Order summiert.** Eine NK-1-Aggregation müsste mindestens den
`buyPrice` aus dem Article-Include erweitern und in-application
multiplizieren.

---

### 5. Eingangsrechnungen — externe Kosten zum Auftrag

#### Strukturelle Beobachtung: zwei getrennte Welten

Es gibt **zwei separate Supplier-Invoice-Modelle** ohne gemeinsame FK:

1. **`InboundInvoice`** (`prisma/schema.prisma:6343–6413`,
   Migration `20260413100000`) — die AP-Welt. Erstellt aus PDF-Upload
   oder IMAP-E-Mail-Polling. Kennt ZUGFeRD-Parsing, Multi-Step-Approval,
   DATEV-CSV-Export, SEPA-Payment-Runs, Bank-Statement-Reconciliation.
2. **`WhSupplierInvoice`** (`prisma/schema.prisma:5789–5823`) — die
   Warehouse-Procurement-Welt. Manuell angelegt gegen einen
   `WhPurchaseOrder`. Hat eigene einfachere Payment-Tracking-Logik.

**Es gibt keinen FK-Pfad zwischen den beiden**: `InboundInvoice` hat
kein `whSupplierInvoiceId`, `WhSupplierInvoice` hat kein
`inboundInvoiceId`. Eine reale Lieferantenrechnung kann beide Records
parallel erzeugen, ohne dass das System diese Verbindung kennt.

#### `InboundInvoice` — Order-Zuordnung

**Auf Kopf-Ebene, einzig**:
```
orderId        String? @map("order_id") @db.Uuid           -- nullable
costCenterId   String? @map("cost_center_id") @db.Uuid     -- nullable

order          Order?      @relation(fields: [orderId], references: [id], onDelete: SetNull)
costCenter     CostCenter? @relation(fields: [costCenterId], references: [id], onDelete: SetNull)

@@index([tenantId, orderId], map: "idx_inbound_invoices_order")
@@index([tenantId, costCenterId], map: "idx_inbound_invoices_cost_center")
```

**Auf Position-Ebene**: `InboundInvoiceLineItem`
(`prisma/schema.prisma:6421–6442`) trägt **kein** `orderId` und kein
`costCenterId`. Eine Position kann nicht auf einen anderen Auftrag
gesplittet werden als der Beleg-Kopf.

**Pflicht?** Beide FKs sind optional auf Schema- und Service-Ebene.
`submitForApproval` (`inbound-invoice-service.ts:370–379`) verlangt nur
`invoiceNumber`, `invoiceDate`, `totalGross`, `supplierId` — Order-/
CostCenter-Zuordnung ist nirgendwo Pflicht.

**Wo wird zugewiesen**: über die `update`-Prozedur
(`src/trpc/routers/invoices/inbound.ts:155`), die `orderId` als optionalen
Eingang akzeptiert (`updateSchema:46` mit `orderId: z.string().uuid().nullable().optional()`).
Service validiert Tenant-Zugehörigkeit der Order (`inbound-invoice-service.ts:239–247`).

#### Aggregations-Funktion?

**Es gibt keine Funktion "summe aller Eingangsrechnungs-Beträge zu Order
X"** im gesamten Codebase. `inbound-invoice-repository.ts:findMany`
(Zeile 63) akzeptiert `orderId` als Filter, gibt aber gefilterte Liste,
keine `groupBy`/`aggregate`-Aufruf.

`wh-supplier-invoice-service.ts:summary` (Zeilen 585–624) liefert
`totalOpen / totalOverdue / totalPaidThisMonth` global oder per
`supplierId` — nicht per Order.

#### Doppelzuordnungs-Risiko

**Es gibt keinerlei Doppelzuordnungs-Prävention im Codebase.** Die zwei
Kostenpfade in eine Order sind komplett unabhängig:

1. `WhStockMovement` (type `WITHDRAWAL`, `orderId` gesetzt) — Material
   gegen Order verbucht. Kostenwert hängt am Article-`buyPrice` (kein
   Snapshot).
2. `InboundInvoice` (`orderId` gesetzt) — Lieferantenrechnungs-Kopf-
   Brutto/Netto gegen Order verbucht.

**Keine Verlinkung**:
- `WhStockMovement` hat kein `inboundInvoiceId` oder `whSupplierInvoiceId`
- `InboundInvoice` hat kein `whStockMovementId`
- Kein Flag wie `alreadyCostedViaStock`, `costedByInvoice` etc.
- Keine Service- oder Query-Logik prüft den Overlap

#### OCR / Processing-Pipeline (Kontext)

Zwei automatisierte Erstellungspfade für `InboundInvoice` neben
manueller Upload:
- **IMAP-E-Mail-Polling** (`src/lib/services/email-imap-poll-service.ts`):
  per-Tenant-Mailbox, PDF-Anhänge (max 20 MB, 50 Messages/Poll),
  ZUGFeRD-Parse → `InboundInvoice` mit `source = "imap"`/`"zugferd"`.
- **ZUGFeRD-Extraktion** (`src/lib/services/zugferd-parser-service.ts`):
  XML-Embedded-Daten aus PDF.

Supplier-Matching (`src/lib/services/inbound-invoice-supplier-matcher.ts`):
USt-ID → Steuernr. → E-Mail-Domain → Fuzzy-Name (Levenshtein). Bei keinem
Match: `supplierStatus = "unknown"`, `supplierId = null`.

---

### 6. Lohngruppen / Stundensätze

#### Lohngruppen-Entität — existiert nicht

**Kein `WageGroup`/`Lohngruppe`/`Qualification`/`EmployeeRole`/
`EmployeeCategory`/`TariffGroup`/`EmploymentCategory`-Modell** im
Schema. Suche in `prisma/schema.prisma` ergab null Treffer.

Rate-Differentiation lebt in flachen Spalten am `Employee`-Modell
(`prisma/schema.prisma:2183–2187`, Migration `20260416100000`):
```
grossSalary    Decimal?  @db.Decimal(10, 2)
hourlyRate     Decimal?  @db.Decimal(10, 2)
paymentType    String?   @db.VarChar(20)        -- z.B. "monthly" | "hourly"
salaryGroup    String?   @db.VarChar(50)        -- Freitext, kein FK
```

`salaryGroup` ist ein freies VarChar-Label, kein FK auf eine
`SalaryGroup`/`TariffGroup`-Tabelle. Es wird nicht für
Rate-Berechnungen verwendet, sondern höchstens deskriptiv (z.B. in
DATEV-Export-Templates).

**Die Snapshot-Geschichte**: `EmployeeSalaryHistory`
(`prisma/schema.prisma:4476–4490`) führt zeitlich versionierte Sätze
mit `validFrom`/`validTo`/`hourlyRate`/`grossSalary`. Das aktuelle
offene Window (`valid_to IS NULL`) sollte synchron mit `Employee.hourlyRate`
sein (Schema-Kommentar Zeile 4475). Der Bridge-Service liest aber **nur
`Employee.hourlyRate`** live, nie History.

#### Tariff — kein Rate-Träger

`Tariff` (`prisma/schema.prisma:3228–3293`) ist ein
**Arbeitszeit-Regel-Container**, kein Compensation-Rate-Träger:
- Vacation-Felder (`annualVacationDays`, `workDaysPerWeek`, `vacationBasis`)
- Target-Hours (`dailyTargetHours`, `weeklyTargetHours`,
  `monthlyTargetHours`, `annualTargetHours`)
- Flextime (`maxFlextimePerMonth`, `upperLimitAnnual`, `lowerLimitAnnual`,
  `flextimeThreshold`, `creditType`)
- Rhythm (`rhythmType`, `cycleDays`, `rhythmStartDate`)
- Overtime-Payout (Migration `20260501000000`)

**Kein `hourlyRate`/`wageRate`/`salaryBase`-Feld auf `Tariff`.**

Employee↔Tariff hat zwei Pfade:
1. Direkter FK: `Employee.tariffId` (`prisma/schema.prisma:2117`)
2. Zeitlich versionierte Assignment-Tabelle: `EmployeeTariffAssignment`
   (`prisma/schema.prisma:2436–2460`) mit `effectiveFrom`/`effectiveTo`/
   `overwriteBehavior`/`isActive`

Tariff treibt die tägliche Zeit-Berechnung über die Kette `Tariff →
WeekPlan → DayPlan` — und die `DayPlanBonus`-Children sind die
tatsächlichen Surcharge-Regeln (siehe Punkt 2 oben).

#### DATEV-Surcharge-Pattern — strukturelles Vorbild

Die Surcharge-Engine ist eine vollständig ausgearbeitete
**bedingte-Sätze-Logik in Minuten-Konten**. Die Pipeline:

```
DayPlanBonus (Regel: Window + calculationType + accountId)
  → calculateSurcharges() → SurchargeResult (Minuten pro accountId)
    → DailyAccountValue (source="surcharge", valueMinutes)
      → aggregateAccountValuesForContext() → employee.accountValues[code]
        → terp_value LiquidJS-Filter → DATEV-Export-Zeile (Lohnart + Stunden)
```

Konditionen heute: `appliesOnHoliday` Boolean, `holidayCategories[]` (im
Schema vorhanden, aktuell immer leer per `convertBonusesToSurchargeConfigs`),
`minWorkMinutes` Gate.

**Was im Schema heute nicht existiert**: Booking-Reason-basierte,
Shift-Type-basierte oder Contract-Mode-basierte Surcharge-Konditionen.

---

### 7. R-1 Bridge-Service als wichtigster Vorbild-Anchor

`src/lib/services/work-report-invoice-bridge-service.ts` ist die nahste
existierende Aggregations-Logik im Codebase.

#### Public-Types

**`ProposedPosition`** (Zeilen 60–70):
```typescript
export interface ProposedPosition {
  kind: "labor" | "travel"
  description: string
  quantity: number       // Stunden, auf 2 Dezimalstellen gerundet
  unit: string           // immer "h"
  unitPrice: number      // EUR/h; 0 wenn requiresManualPrice = true
  vatRate: number        // immer VAT_DEFAULT (19.0)
  sourceBookingId?: string
  employeeId?: string
  requiresManualPrice: boolean
}
```

**`PositionOverride`** (Zeilen 79–87): die Server-akzeptierte Variante,
ohne `employeeId` und `requiresManualPrice` (UI-only-Felder).

**Konstante**: `export const VAT_DEFAULT = 19.0` (Zeile 43).

#### Datenquellen die aggregiert werden

`computeProposedPositions(prisma, tenantId, workReportId)` (Zeilen
243–331) lädt:

1. **WorkReport** mit `assignments + employee`, `order` (Zeilen 248–257)
   — für Reisezeit-Position und Travel-Rate-Lookup über alle
   zugewiesenen Mitarbeiter.
2. **OrderBookings** scoped auf `workReportId` (Zeilen 263–270):
   ```typescript
   prisma.orderBooking.findMany({
     where: { tenantId, workReportId },
     include: { activity: true, employee: true },
     orderBy: [{ bookingDate: "asc" }, { createdAt: "asc" }],
   })
   ```
   — **nur Buchungen, die explizit zum Schein getaggt sind**, fließen
   ein. Buchungen mit `workReportId = null` auf demselben Order werden
   ausgelassen.

#### Stundensatz-Lookup

Pro Buchung — `resolveLaborRate(orderRate, employeeRate)` (Zeilen 192–201):
1. `Order.billingRatePerHour` (positiv) → verwendet
2. `Employee.hourlyRate` (positiv) → Fallback
3. Sonst `null` → `unitPrice = 0`, `requiresManualPrice = true`

Für Travel-Position — `resolveTravelRate(orderRate, assignmentEmployees)`
(Zeilen 213–227):
1. `Order.billingRatePerHour` (positiv) → verwendet
2. **Maximum** über `WorkReportAssignment.employee.hourlyRate` aller
   Assignments → Fallback. **Nicht** Booking-Mitarbeiter, sondern
   Schein-Mitarbeiter.
3. Sonst `null` → `requiresManualPrice = true`

#### Reisezeit-Behandlung

Travel-Position (Zeilen 309–328) wird nur emittiert, wenn
`workReport.travelMinutes > 0`. Output:
```typescript
{
  kind: "travel",
  description: `Anfahrt: ${workReport.travelMinutes} Minuten`,
  quantity: roundTo2(workReport.travelMinutes / 60),
  unit: "h",
  unitPrice,
  vatRate: VAT_DEFAULT,
  requiresManualPrice,
}
```

**Eine einzige Travel-Position pro Schein**, kein Splitting auf
Mitarbeiter, kein Splitting auf Buchungen. Die Travel-Position trägt
weder `sourceBookingId` noch `employeeId`.

#### Edge-Cases

- **Booking ohne Stundensatz**: `unitPrice = 0`, `requiresManualPrice = true`,
  Position bleibt sichtbar (UI bordert sie destruktiv mit Tooltip
  "Stundensatz nicht ermittelbar — bitte manuell eintragen.").
- **WorkReport ohne `serviceObject` / ohne `customerAddressId`**:
  `previewInvoiceGeneration` markiert das mit `warnings: ["noAddress"]`,
  der Generate-Dialog zeigt destruktiven Alert und blockt Submit. Bei
  `generateInvoiceFromWorkReport` direkt: `WorkReportNoAddressPreconditionFailedError`.
- **WorkReport im Status != SIGNED** beim Generate:
  `WorkReportNotEligibleForInvoicePreconditionFailedError`.
- **Bereits existierende Rechnung**:
  `WorkReportAlreadyInvoicedConflictError` mit `existingDocumentId`/
  `existingDocumentNumber`/`existingDocumentStatus`. Cancelled-Dokumente
  werden ausgenommen (Storno → Re-Generate funktioniert).
- **Keine Buchungen UND `travelMinutes = 0`**: leeres
  `proposedPositions[]`, Preview-Warning `"noEligibleBookings"`, aber
  manuelle Position kann hinzugefügt werden — Submit nicht geblockt.

#### Ausgabe-Pfad

`generateInvoiceFromWorkReport` (Zeilen 354–516) erstellt einen
`BillingDocument` vom Typ `INVOICE` über `billingDocumentService.create`,
fügt jede Position via `addPosition`-Schleife mit `type: "FREE"` hinzu.
Audit-Logs werden außerhalb der Transaktion fire-and-forget geschrieben.

---

### 8. ServiceObject (T-1/T-2/T-3) — Asset-Verbindung

#### Modell (`prisma/schema.prisma:898–994`)

Enums:
```prisma
enum ServiceObjectKind {
  SITE         -- T-1 Standort
  BUILDING
  SYSTEM       -- T-2 Anlage
  EQUIPMENT
  COMPONENT    -- T-3 Komponente
}

enum ServiceObjectStatus {
  OPERATIONAL | DEGRADED | IN_MAINTENANCE | OUT_OF_SERVICE | DECOMMISSIONED
}

enum BuildingUsage {
  OFFICE | WAREHOUSE | PRODUCTION | RETAIL | RESIDENTIAL | MIXED | OTHER
}
```

**Hierarchie** über Self-Referential FK: `parentId` + `parent ServiceObject?` +
`children ServiceObject[]`. **Keine Tiefen-Begrenzung** im Schema —
die fünf `kind`-Werte sind konzeptuelle Hierarchie, werden nicht via
FK-Constraint erzwungen. Service validiert nur, dass Parent und Child
denselben `customerAddressId` teilen
(`service-object-service.ts:216`).

**Kind-spezifische Felder**:
- `SITE`: `siteStreet`, `siteZip`, `siteCity`, `siteCountry`, `siteAreaSqm`
- `BUILDING`: `floorCount`, `floorAreaSqm`, `buildingUsage`, `yearBuilt`,
  `inServiceSince`
- `SYSTEM`/`EQUIPMENT`/`COMPONENT`: `manufacturer`, `model`, `serialNumber`,
  `yearBuilt`, `inServiceSince`

Field-Validierung pro Kind via `ALLOWED_FIELDS_BY_KIND`-Map
(`service-object-service.ts:50–78`).

#### Order ↔ ServiceObject

`Order.serviceObjectId String?` (`prisma/schema.prisma:2584`,
Beziehung Zeile 2589, `onDelete: SetNull`). **Cardinality**: n:1 — viele
Aufträge können auf dasselbe ServiceObject zeigen, ein Auftrag hat
maximal ein ServiceObject. **Keine m:n-Join-Table**.

Die gleiche Verbindung gilt für `WorkReport.serviceObjectId`
(`prisma/schema.prisma:2665`), ebenfalls nullable mit `onDelete: SetNull`.

`@@index([tenantId, serviceObjectId])` auf `Order` (Zeile 2606) macht die
Aggregation "alle Orders für ServiceObject X" performant.

#### Maintenance-Felder — auf separater Entität

`ServiceObject` selbst trägt **keine** `maintenanceIntervalDays`,
`lastMaintenanceDate`, `nextMaintenanceDate`. Diese leben auf
`ServiceSchedule` (`prisma/schema.prisma:1032–1091`):

```
intervalType          ServiceScheduleIntervalType   -- TIME_BASED | CALENDAR_FIXED
intervalValue         Int
intervalUnit          ServiceScheduleIntervalUnit   -- DAYS | MONTHS | YEARS
anchorDate            DateTime?
estimatedHours        Decimal?
lastCompletedAt       DateTime?
nextDueAt             DateTime?
leadTimeDays          Int      @default(14)
```

Ein ServiceObject kann mehrere Wartungspläne tragen (1:n via
`ServiceSchedule.serviceObjectId`). Vom Schedule generierte Aufträge
behalten den Backlink über `Order.serviceScheduleId`.

#### Aggregation per ServiceObject

`serviceObjects.getHistory` (Router-Zeile 111, Service-Zeile 826) ist
die einzige existierende Cross-Order-Aggregation per ServiceObject. Sie
liefert:
- Alle Orders mit `serviceObjectId = X` (via
  `order-repository.findManyByServiceObject`, Zeile 40)
- Pro Order: Booking-Summary aus `orderBookingAggregator.getBookingSummariesByOrders`
  (`totalMinutes`, `bookingCount`, `lastBookingDate`)
- Alle StockMovements mit `serviceObjectId` (via `wh-withdrawal-service.listByServiceObject`)
- Gesamt-Totals: `orderCount`, `totalMinutes`, `movementCount`

**Keine Kostenaggregation** — keine Lohn-Summe, keine Material-Summe,
keine Billing-Beträge. Nur Minuten und Bewegungen.

#### CRM/Address-Verbindung

`ServiceObject.customerAddressId` ist **NOT NULL**
(`prisma/schema.prisma:941`) — jedes ServiceObject muss zu einer
`CrmAddress` gehören. Service validiert, dass die Address im Tenant
ist und `type` ∈ `{CUSTOMER, BOTH}` trägt
(`service-object-service.ts:191`).

Bei Aggregation "per Kunde" für NK-1: Customer-Identität geht über
`Order → ServiceObject → CrmAddress`, nicht direkt über
`Order.customer` (das ist nur ein Freitext-Feld).

---

### 9. TenantModule-Gating

#### Modell (`prisma/schema.prisma:329–351`)

```
model TenantModule {
  id                      String   @id
  tenantId                String   @map("tenant_id")
  module                  String   @db.VarChar(50)              -- kein Enum
  enabledAt               DateTime @default(now())
  enabledById             String?  @map("enabled_by_id")        -- tenant-side User
  enabledByPlatformUserId String?                                -- platform-side User, kein @relation
  operatorNote            String?
  ...
  @@unique([tenantId, module], map: "uq_tenant_modules_tenant_module")
  @@index([tenantId])
}
```

**Modul-Katalog (Source of Truth)**:
`src/lib/modules/constants.ts`:
```typescript
export const AVAILABLE_MODULES = [
  "core",
  "crm",
  "billing",
  "warehouse",
  "inbound_invoices",
  "payment_runs",
  "bank_statements",
] as const
export type ModuleId = (typeof AVAILABLE_MODULES)[number]
```

Dieses Modul ist client-safe und wird sowohl von Server- als auch
Client-Code importiert (deshalb getrennt von `index.ts`, das
server-only Imports enthält).

`module-pricing.ts` (`src/lib/platform/module-pricing.ts:51–94`)
spiegelt alle 7 Module mit `{ monthly, annual, vatRate, description }`
für die Platform-Subscription-Billing.

#### Router-Gating-Pattern

Per-Router lokale Base-Procedure mit `requireModule(...)`:

```typescript
// src/trpc/routers/warehouse/articles.ts:27–28
const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// src/trpc/routers/invoices/inbound.ts:22–24
const invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))

// src/trpc/routers/billing/documents.ts:19–20
const billingProcedure = tenantProcedure.use(requireModule("billing"))
```

Die Middleware `requireModule(module)` (`src/lib/modules/index.ts:70–98`):
1. Extrahiert `tenantId` aus `ctx`, sonst `FORBIDDEN: "Tenant ID required"`
2. Short-circuit für `module === "core"` → `next()`
3. `hasModule(prisma, tenantId, module)` Check
4. Sonst: `FORBIDDEN: \`Module "${module}" is not enabled for this tenant\``

Es wird ein DB-Roundtrip pro Prozedur-Aufruf durchgeführt (kein
In-Memory-Cache).

#### UI-Gating-Pattern

Hook `src/hooks/use-modules.ts`:
```typescript
export function useModules(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.tenantModules.list.queryOptions(undefined, {
      enabled,
      staleTime: 5 * 60 * 1000,
    })
  )
}
```

Sidebar-Config `src/components/layout/sidebar/sidebar-nav-config.ts`
trägt optional `module?: string` auf `NavSection` (Zeile 107) und
`NavItem` (Zeile 78). Filter-Funktionen
`filterNavSection`/`filterNavItem` (Zeilen 812–854) entfernen
Sektionen/Items, deren Modul nicht im
`enabledModules: Set<string>` ist.

`SidebarNav` (`src/components/layout/sidebar/sidebar-nav.tsx:75–85`)
und Command-Menu (`src/components/layout/command-menu.tsx:55–58`)
duplizieren das Pattern identisch.

**Keine Route-Level-Middleware** auf der Next.js-Seite — Modul-Gating
in der UI ist rein Sidebar/Menu-Sichtbarkeit. Datenzugriffsschutz
liegt vollständig auf der tRPC-`requireModule`-Middleware.

#### Platform-Admin-Toggle (Phase 10a)

`src/trpc/platform/routers/tenantManagement.ts:697–1017` enthält
`listModules`, `enableModule`, `disableModule`. Alle hinter
`platformAuthedProcedure`.

`enableModule` (Zeilen 808–926) Flow:
1. Upsert `tenantModule`-Zeile mit `enabledByPlatformUserId = ctx.platformUser.id`
2. **Billing-Bridge**: Wenn `isSubscriptionBillingEnabled() &&
   !isOperatorTenant(tenantId) && !tenant.billingExempt` und keine
   aktive `PlatformSubscription` für `(tenantId, module)` existiert →
   `subscriptionService.createSubscription(...)` mit
   `billingCycle: "MONTHLY"` (default) oder `"ANNUALLY"`.
3. Eine `platform_audit_logs`-Zeile mit Action `"module.enabled"`.

`disableModule` (Zeilen 928–1017): symmetrisch — guards `core`, löscht
`tenantModule`-Zeile, ruft `subscriptionService.cancelSubscription` für
non-Operator/non-exempt, schreibt eine `platform_audit_logs`-Zeile mit
`"module.disabled"`.

`subscriptionService.createSubscription`
(`src/lib/platform/subscription-service.ts:375`) läuft in eigener
`$transaction`. Findet/erstellt operator-side `CrmAddress`, fügt
`PlatformSubscription`-Zeile ein, erweitert oder erstellt
`BillingRecurringInvoice` für `(operatorTenantId, crmAddressId, interval)`.

**House-Tenant-Regel**: Operator-Tenant (`PLATFORM_OPERATOR_TENANT_ID`)
wird nicht für eigene Modul-Buchungen abgerechnet —
`isOperatorTenant(tenantId)` Check.

---

### 10. Vertrags-Entität (NK-2-Vorbereitung)

#### Contract-Heute — existiert nicht

**Kein** `Contract`/`ServiceContract`/`MaintenanceContract`/`Vertrag`/
`FrameworkContract`/`Rahmenvertrag`/`ServiceAgreement`-Modell im
Schema. Das Wort `contract` taucht nur in unrelated Stellen auf:
- `prisma/schema.prisma:356`: Kommentar im `PlatformSubscription`-Block
- `prisma/schema.prisma:2188–2192`: Employee-HR-Felder (`contractType`,
  `probationMonths`, `noticePeriodEmployee`, `noticePeriodEmployer`)
- `prisma/schema.prisma:6713, 6740`: `contractNumber` auf
  `EmployeePension` und `EmployeeSavings` (Versicherungsreferenz-
  Nummern)

**`Order` hat heute kein `contractId`-Feld** — Suche in der gesamten
`schema.prisma` ergab null Treffer für `contractId`.

Die einzige Freitext-Spalte, die provisorisch eine Contract-Referenz
tragen könnte, ist `Order.description String? @db.Text`
(`prisma/schema.prisma:2574`).

#### `BillingRecurringInvoice` als naheste verwandte Pattern

`prisma/schema.prisma:1502–1542`:

```
model BillingRecurringInvoice {
  id              String                              @id
  tenantId        String
  name            String
  addressId       String                              -- CrmAddress FK (Pflicht)
  contactId       String?                             -- CrmContact? FK
  interval        BillingRecurringInterval            -- enum
  servicePeriodMode BillingRecurringServicePeriodMode @default(IN_ARREARS)
  startDate       DateTime
  endDate         DateTime?
  nextDueDate     DateTime
  lastGeneratedAt DateTime?
  autoGenerate    Boolean   @default(false)
  isActive        Boolean   @default(true)
  // Invoice-Template-Felder
  deliveryType / deliveryTerms / paymentTermDays / discountPercent / discountDays / notes / internalNotes
  // Position-Template als JSONB Array
  positionTemplate Json    @db.JsonB
  ...
}
```

Enums:
- `BillingRecurringInterval`: `MONTHLY | QUARTERLY | SEMI_ANNUALLY | ANNUALLY`
- `BillingRecurringServicePeriodMode`: `IN_ARREARS | IN_ADVANCE`

**Beobachtungen**:
- Es gibt **kein separates Position-Modell** — Positionen leben als
  JSONB-Array auf der Template-Zeile.
- `generate()` (`billing-recurring-invoice-service.ts:387–506`) erstellt
  einen realen `BillingDocument` vom Typ `INVOICE` in `DRAFT`-Status
  über `billingDocumentService` direkt.
- **Keine Backlink-FK** von `BillingDocument` zu `BillingRecurringInvoice`
  — eine Rechnung weiß nicht, dass sie aus einem Recurring-Template
  generiert wurde.
- **Kein Order-Bezug** — Recurring-Invoice ist customer-zentriert
  (`addressId`), nicht order-zentriert.
- **Kein Pauschalpreis-Konzept** — `positionTemplate` ist eine flexible
  JSONB-Liste, nicht ein einzelner Pauschalbetrag.

Cron: `src/app/api/cron/recurring-invoices/route.ts` läuft 04:00 UTC,
ruft `recurringService.generateDue(prisma, today)`. Pro erfolgreich
generierter Rechnung wird ein `CronCheckpoint` geschrieben (re-run-safe).

#### `PlatformSubscription` — platform-only

`prisma/schema.prisma:384–409`:

```
model PlatformSubscription {
  id, tenantId, module String,
  status, billingCycle, unitPrice, currency, startDate, endDate?, actualEndDate?,
  operatorCrmAddressId String?,
  billingRecurringInvoiceId String?,           -- pointer ohne @relation (cross-domain)
  lastGeneratedInvoiceId String?,              -- pointer ohne @relation
  createdAt, createdByPlatformUserId,
  cancelledAt?, cancelledByPlatformUserId?, cancellationReason?
}
```

**Tenant-facing? Nein.** `PlatformSubscription` ist platform-admin-only,
hinter `platformAuthedProcedure`. Tenants haben keine eigene
Subscription-/Vertragstabelle für ihren UI-Stack.

Die drei Pointer-Felder (`operatorCrmAddressId`, `billingRecurringInvoiceId`,
`lastGeneratedInvoiceId`) sind plain-UUID-Strings ohne `@relation` —
weil sie auf Terp-Domain-Modelle zeigen (`CrmAddress`, `BillingRecurringInvoice`,
`BillingDocument`), die im operator-Tenant leben. FKs existieren nur
auf SQL-Ebene über `REFERENCES`-Klauseln in der Migration. Cross-domain-
Lookups erfolgen über zwei separate Prisma-Queries.

#### Andere "Agreement"-Strukturen?

- `ServiceSchedule` (`prisma/schema.prisma:1032–1091`) — Wartungs-
  Schedules erzeugen Orders, aber kein billing-relevantes Vertragsobjekt.
- Kein `Insurance`/`Retainer`/`FrameContract`-Modell.

---

### 11. Datenqualitäts-Risiken

| # | Risiko | Spalte / Modell | Schema-Constraint | Code-Behandlung | Failure-Mode |
|---|---|---|---|---|---|
| 1 | OrderBooking ohne Stundensatz | `Order.billingRatePerHour` und `Employee.hourlyRate`, beide `Decimal?` | Beide nullable | `resolveLaborRate` setzt `requiresManualPrice=true`, `unitPrice=0` (`work-report-invoice-bridge-service.ts:192–201`); kein Check beim Buchen | Aggregation, die `unitPrice` direkt summiert, würde 0-Werte als realisierten Erlös werten → Ist-Erlös unterschätzt |
| 2 | WhStockMovement ohne Bewertung | Bewegung selbst hat **kein** Preisfeld; `WhArticle.buyPrice` ist `Float?` | `buyPrice` nullable, kein DB-CHECK | Keine Service-Validierung; `bookGoodsReceipt` und `createWithdrawal` schreiben keinen Preis | Materialkosten-Aggregation per Order müsste live gegen aktuellen `buyPrice` joinen — keine Snapshot, retroaktive Preisänderungen verändern Historie |
| 3 | InboundInvoice ohne Order-/Kostenstellen-Zuordnung | `InboundInvoice.orderId` und `costCenterId`, beide `Uuid?` | Beide nullable | Keine Pflicht im Service, IMAP-Polling lässt offen | Kostenaggregation per Order schließt nicht-zugeordnete Rechnungen lautlos aus |
| 4 | WorkReport im Status DRAFT | `WorkReport.status` Enum `DRAFT/SIGNED/VOID` | Default `DRAFT` | `findMany` filtert nicht nach Status; nur `generateInvoiceFromWorkReport` erzwingt SIGNED | Aggregation, die nicht auf SIGNED filtert, zählt unterschriebene und unfertige Scheine gleich |
| 5 | OrderBooking ohne Order | `OrderBooking.orderId` ist **NOT NULL** im Schema und in der DB-Migration | Pflicht | tRPC-Schema fordert `orderId: z.string()` | Strukturell ausgeschlossen — Buchung ohne Order kann nicht existieren |
| 6 | Buchung mit ungültiger/null Dauer | `OrderBooking.timeMinutes Int` | NOT NULL, **kein** DB-CHECK auf `> 0` | tRPC: `z.number().int().min(1).max(1440)`. Service vertraut tRPC, kein eigener Check | Imports/Direct-DB-Schreibvorgänge mit `timeMinutes = 0` würden in Buchungs-Anzahl steigen, Summe bleibt korrekt, aber Durchschnittswerte verzerren |
| 7 | Mitarbeiter ohne Stundensatz zum Buchungszeitpunkt | `Employee.hourlyRate Decimal?` (live-Lookup, kein Snapshot auf Buchung) | Nullable | Bridge-Service liest aktuelle Rate live | Lohnerhöhung verändert retroaktiv historische Kostenwerte ohne Audit-Spur |
| 8 | Soft-Delete-Konventionen uneinheitlich | `Employee.deletedAt`, `Order.isActive`, `Activity.isActive`, `WhArticle.isActive`, `CrmAddress.isActive` | Gemischt | `order-booking-repository.ts:findEmployee/findOrder/findActivity` filtern weder `deletedAt` noch `isActive` | Buchungen können auf gelöschte Mitarbeiter, deaktivierte Aufträge und inaktive Artikel angelegt werden — Aggregation würde diese mitnehmen ohne Marker |

#### Detail zu Risiko 1: `requiresManualPrice` Pfad

In `computeProposedPositions` (`work-report-invoice-bridge-service.ts:276`)
wird die Position immer emittiert, mit `unitPrice: 0` und
`requiresManualPrice: true`, wenn beide Raten null sind. Die
UI-Komponente
`src/components/work-reports/work-report-generate-invoice-dialog.tsx:313–316`
rendert solche Cells mit `border-2 border-destructive` und Tooltip. Das
ist ein UI-only-Marker — keine DB-persistierte Spalte.

#### Detail zu Risiko 4: Aggregations-Filter für WorkReport-Status

`work-report-repository.ts:findMany` (Zeilen 62–79) setzt
`where.status = params.status` nur, wenn der Parameter übergeben wird.
Default ist also "alle Status". Der Bridge-Service `computeProposedPositions`
prüft Status nicht — erst `generateInvoiceFromWorkReport`
(`work-report-invoice-bridge-service.ts:376–380`) wirft
`WorkReportNotEligibleForInvoicePreconditionFailedError` bei
non-SIGNED.

#### Detail zu Risiko 7: Snapshot-Felder

Suche im gesamten `src/`-Verzeichnis und `schema.prisma` nach
`hourlyRateAtBooking`, `rateAtBooking`, `rate_snapshot` ergab null
Treffer. Es gibt keinen historischen Rate-Snapshot auf `OrderBooking`.
`EmployeeSalaryHistory` (`prisma/schema.prisma:4476–4490`) führt
zeitlich versionierte Sätze, wird aber vom Bridge-Service nicht gelesen.

---

## Was war überraschend

1. **`WhStockMovement.orderId` hat keine Prisma-Relation** — die Spalte
   ist nur als bare SQL-FK vorhanden. Order hat kein `stockMovements
   WhStockMovement[]`-Backref. Eine Materialkosten-Aggregation per
   Order kann also nicht über `prisma.order.findUnique({ include:
   { stockMovements: true }})` laufen, sondern nur über separate
   Queries auf `whStockMovement` mit `where: { orderId }`. Im Gegensatz
   dazu trägt `WorkReport` einen vollständigen bidirektionalen Pfad zu
   `WhStockMovement`.

2. **Es gibt keinerlei Bewertungspreis auf `WhStockMovement`** — kein
   Snapshot bei Wareneingang, kein moving-average, kein WAC. `WhArticle.buyPrice`
   ist eine statische Stammdatenspalte, die durch keinen Wareneingang
   automatisch aktualisiert wird. Eine Materialkosten-Berechnung muss
   live joinen, und bei jeder Preisänderung am Artikel verändern sich
   alle historischen Kostenwerte rückwirkend ohne Audit-Spur.

3. **Es gibt zwei unverbundene Lieferantenrechnungs-Modelle**
   (`InboundInvoice` für AP/DATEV-Welt, `WhSupplierInvoice` für
   Procurement-Welt), und kein Modell hat einen FK zum anderen. Eine
   reale Lieferantenrechnung kann beide Records parallel erzeugen, ohne
   dass das System diese Verbindung kennt — zusätzlich zu der bereits
   bekannten Doppelzuordnung über `WhStockMovement` (orderId) ↔
   `InboundInvoice` (orderId).

4. **`OrderBooking` hat keine Schicht-/Uhrzeit-Information**.
   `bookingDate` ist `@db.Date` (nur Tag), `timeMinutes` ist eine
   einzige Integer-Summe ohne Start/Ende. Die DATEV-Surcharge-Engine
   arbeitet ausschließlich auf der separaten Time-Tracking-`Booking`-
   Domäne (Terminal-Stempelung), nicht auf `OrderBooking`. Das heißt:
   Schicht-/Feiertag-Zuschläge können nicht auf Auftragsbuchungen
   angewendet werden, weil die Stempelung-zu-Auftrag-Verbindung beim
   Daily-Calc-Pipeline-Run nicht persistent gemacht wird.

5. **Lohngruppen existieren als Konzept überhaupt nicht im Datenmodell**
   — weder als eigene Tabelle, noch als Enum, noch als FK-tragende
   Spalte. `Employee.salaryGroup String?` ist Freitext (VarChar(50)).
   `Tariff` ist ein Arbeitszeit-Regel-Container, kein Rate-Träger. Es
   gibt also strukturell keine Möglichkeit, "Soll-Stunden je Lohngruppe"
   ohne neuen Datenbank-Mechanismus abzubilden.

## Code References

### Order-Domäne
- `prisma/schema.prisma:2569-2608` — Order-Modell
- `src/lib/services/order-service.ts` — CRUD-Service
- `src/lib/services/order-repository.ts` — Prisma-Queries
- `src/trpc/routers/orders.ts:137-271` — tRPC-Router
- `src/components/orders/order-form-sheet.tsx` — UI-Form

### OrderBooking
- `prisma/schema.prisma:5452-5484` — OrderBooking-Modell
- `src/lib/services/order-booking-service.ts` — Service
- `src/lib/services/order-booking-aggregator.ts:17-60` — `getBookingSummaryByOrder` (einzige Aggregation)
- `src/trpc/routers/orderBookings.ts` — tRPC-Router
- `src/components/orders/order-booking-form-sheet.tsx` — UI-Form

### WorkReport
- `prisma/schema.prisma:2661-2709` — WorkReport-Modell
- `prisma/schema.prisma:663-669` — `WorkReportStatus` Enum
- `src/trpc/routers/workReports.ts` — tRPC-Router

### R-1 Bridge-Service
- `src/lib/services/work-report-invoice-bridge-service.ts:60-70` — `ProposedPosition` Type
- `src/lib/services/work-report-invoice-bridge-service.ts:79-87` — `PositionOverride` Type
- `src/lib/services/work-report-invoice-bridge-service.ts:95-153` — Error-Klassen
- `src/lib/services/work-report-invoice-bridge-service.ts:179-184` — `toPositiveRate`
- `src/lib/services/work-report-invoice-bridge-service.ts:192-201` — `resolveLaborRate`
- `src/lib/services/work-report-invoice-bridge-service.ts:213-227` — `resolveTravelRate`
- `src/lib/services/work-report-invoice-bridge-service.ts:243-331` — `computeProposedPositions`
- `src/lib/services/work-report-invoice-bridge-service.ts:354-516` — `generateInvoiceFromWorkReport`
- `src/components/work-reports/work-report-generate-invoice-dialog.tsx` — UI

### Material/Warehouse
- `prisma/schema.prisma:5508-5549` — `WhArticle`
- `prisma/schema.prisma:5573-5594` — `WhArticleSupplier`
- `prisma/schema.prisma:5620-5629` — `WhStockMovementType` Enum
- `prisma/schema.prisma:5731-5770` — `WhStockMovement`
- `src/lib/services/wh-withdrawal-service.ts:478-492` — `listByOrder`
- `src/lib/services/wh-stock-movement-service.ts:112-270` — `bookGoodsReceipt`
- `src/lib/services/wh-article-repository.ts:501-523` — `getStockValueSummary` (Tenant-weit)

### InboundInvoice
- `prisma/schema.prisma:6343-6413` — `InboundInvoice`
- `prisma/schema.prisma:6421-6442` — `InboundInvoiceLineItem` (kein orderId)
- `prisma/schema.prisma:5789-5823` — `WhSupplierInvoice` (separate Welt)
- `src/lib/services/inbound-invoice-service.ts` — Service
- `src/trpc/routers/invoices/inbound.ts:155` — `update`-Procedure (orderId-Zuweisung)

### Lohngruppen / DATEV
- `prisma/schema.prisma:2183-2187` — Employee-Compensation-Felder
- `prisma/schema.prisma:4476-4490` — `EmployeeSalaryHistory`
- `prisma/schema.prisma:3147-3168` — `DayPlanBonus`
- `prisma/schema.prisma:5128-5157` — `DailyAccountValue`
- `src/lib/calculation/surcharges.ts:31-95` — `calculateSurcharges`
- `src/lib/calculation/surcharges.ts:106-126` — `splitOvernightSurcharge`
- `src/lib/calculation/surcharges.ts:215-235` — `surchargeApplies`
- `src/lib/services/daily-calc.ts:1649-1729` — `postSurchargeValues`
- `src/lib/services/daily-calc.helpers.ts:409-424` — `convertBonusesToSurchargeConfigs`
- `src/lib/services/payroll-export-service.ts:137-193` — `generateDatevLodas`

### ServiceObject
- `prisma/schema.prisma:898-994` — `ServiceObject` + Enums
- `prisma/schema.prisma:1032-1091` — `ServiceSchedule`
- `src/lib/services/service-object-service.ts` — Service
- `src/lib/services/service-schedule-service.ts` — Wartungspläne
- `src/trpc/routers/serviceObjects.ts` — tRPC

### TenantModule
- `prisma/schema.prisma:329-351` — `TenantModule`
- `src/lib/modules/constants.ts` — `AVAILABLE_MODULES`
- `src/lib/modules/index.ts:70-98` — `requireModule`
- `src/lib/services/tenant-module-service.ts` — Service
- `src/trpc/platform/routers/tenantManagement.ts:697-1017` — Platform-Toggle
- `src/lib/platform/subscription-service.ts:375` — `createSubscription`
- `src/lib/platform/module-pricing.ts:51-94` — Modul-Preise

### Contract / Recurring
- `prisma/schema.prisma:1502-1542` — `BillingRecurringInvoice`
- `prisma/schema.prisma:384-409` — `PlatformSubscription`
- `src/lib/services/billing-recurring-invoice-service.ts` — Service
- `src/app/api/cron/recurring-invoices/route.ts` — Cron

### CRM
- `prisma/schema.prisma:433` — `CrmAddressType` Enum
- `prisma/schema.prisma:481` — `CrmAddress`
- `src/lib/services/crm-address-service.ts` — Service

## Architecture Documentation

### Beobachtete Patterns

1. **Service + Repository in `src/lib/services/`**: jede Domäne hat
   ein `<topic>-service.ts` (Geschäftslogik) + `<topic>-repository.ts`
   (Prisma-Queries). NK-1 würde diesem Pattern folgen.

2. **Aggregator-Hilfsdateien**: `order-booking-aggregator.ts` ist ein
   eigenständiges Modul ohne Service-Pendant — pure-function-Style mit
   `prisma.groupBy`-basierten Aggregationen. Vorbild für eine
   Nachkalk-Aggregator-Datei.

3. **Bridge-Service-Pattern**: `work-report-invoice-bridge-service.ts`
   bridges zwei Domänen (WorkReport + Billing) über eine
   "compute-then-create"-Architektur:
   - `computeProposedPositions()` — pure read, liefert Vorschlag
   - `generateInvoiceFromWorkReport()` — write, persistiert
   Das Pattern lässt sich auf "compute-Ist-Aggregat"-Schicht abstrahieren.

4. **Module-Gating per lokalem Procedure-Wrapper**:
   `tenantProcedure.use(requireModule(...))` als lokale Konstante in
   jedem Router. Konsistent über 7 Module hinweg.

5. **JSONB für flexible Position-Templates**: `BillingRecurringInvoice.positionTemplate`
   ist `Json @db.JsonB` — keine separate Position-Tabelle. Pattern
   eignet sich für lockere/flexible Soll-Komponenten ohne starkes
   Aggregations-Bedürfnis.

6. **Cross-Domain-FKs ohne Prisma-`@relation`**: gesehen in
   `WhStockMovement.orderId`, `PlatformSubscription.{operatorCrmAddressId,
   billingRecurringInvoiceId, lastGeneratedInvoiceId}`. Bewusste
   Entscheidung, FK auf SQL-Ebene zu halten und Prisma-Relations zu
   vermeiden, wenn die Modelle in unterschiedlichen "logischen
   Welten" leben (Plattform vs. Tenant).

7. **State-Snapshots fehlen durchgängig**: Keine Rate-Snapshots auf
   `OrderBooking`, keine Preis-Snapshots auf `WhStockMovement`.
   Snapshot-Mechanismus existiert nur für Salary-Historie
   (`EmployeeSalaryHistory`), aber wird nicht für Buchungen oder
   Bewegungen genutzt.

8. **Validation-Ladder**: tRPC-Schema (Zod) → Router-Service-Aufruf →
   Service-Validierung (Domain-Errors) → Repository-Prisma-Query.
   Domain-Errors werden über `handleServiceError` in `src/trpc/errors.ts`
   in `TRPCError`-Codes übersetzt.

### Multi-Tenant-Konventionen

- Jede tenant-relevante Tabelle hat `tenantId String @db.Uuid`.
- Composite-Indizes mit `tenantId` als erstem Bestandteil.
- `tenantProcedure` injiziert `tenantId` in `ctx`.
- Repository-Funktionen nehmen `tenantId` als zweiten Parameter und
  filtern explizit.
- Prisma-`@relation` zu `Tenant` mit `onDelete: Cascade` auf den
  meisten Domänen-Modellen.

## Historical Context (from thoughts/)

### NK-Followups Backlog
- `thoughts/shared/backlog/nachkalkulation-vertragsmodi.md` — die
  zentrale strategische Diskussion, NK-2 bis NK-6 Roadmap, Architektur-
  Vorbereitungen für NK-1.

### R-1 Bridge-Service (direktes Vorbild)
- `thoughts/shared/plans/2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md`
  — R-1 Implementation-Plan
- `thoughts/shared/research/2026-04-24-rechnungs-uebernahme-arbeitsschein.md`
  — R-1 IST-Bestandsaufnahme

### R-2 Billing-Modes (Synergie mit `Order.billingMode`)
- `thoughts/shared/backlog/r2-billing-modes-flat-rate-followup.md` —
  R-2 Konzept: `Order.billingMode` Enum (HOURLY/FLAT_RATE/MIXED), bedeutet
  Synergie mit NK-1 bei Pauschal-Aufträgen.

### WorkReport / Arbeitsschein (M-1)
- `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md`
- `thoughts/shared/research/2026-04-22-workreport-arbeitsschein-m1-codebase-analyse.md`

### ServiceObject (T-1/T-2/T-3)
- `thoughts/shared/plans/2026-04-21-serviceobjekte-stammdaten.md` (T-1)
- `thoughts/shared/plans/2026-04-21-serviceobjekte-historie.md` (T-2)
- `thoughts/shared/plans/2026-04-22-serviceobjekte-wartungsintervalle.md` (T-3)

### Order / Auftrag
- `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_01_BELEGKETTE.md`
- `thoughts/shared/tickets/ZMI-TICKET-112-projektmappe-dashboard.md`
  — Projektmappe Plan-vs-Ist (NK-1-Vorgänger-Idee)

### OrderBooking
- `thoughts/shared/research/2026-03-08-ZMI-TICKET-249-prisma-schema-corrections-order-bookings.md`
- `thoughts/shared/research/2026-03-08-ZMI-TICKET-250-order-bookings-correction-assistant-router.md`

### Material / Warehouse
- `thoughts/shared/plans/2026-03-24-WH_05-lagerentnahmen.md`
- `thoughts/shared/research/2026-04-07-inventur-modul.md`

### InboundInvoice
- `thoughts/shared/research/2026-04-07-terp-invoice-phase1-eingangsrechnungen.md`
- `thoughts/shared/research/2026-04-12_15-34-14_inbound-invoice-order-costcenter-bestandsaufnahme.md`
- `thoughts/shared/plans/2026-04-12-inbound-invoice-order-costcenter.md`

### DATEV / Surcharges
- `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`
- `thoughts/shared/plans/2026-04-17-pflicht-02-datev-zuschlaege.md`
- `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`
- `thoughts/shared/reference/zmi-calculation-manual-reference.md`

### Wartungs-/Recurring-Verträge
- `thoughts/shared/research/2026-03-18-ORD_05-wiederkehrende-rechnungen.md`
- `thoughts/shared/plans/2026-03-18-ORD_05-wiederkehrende-rechnungen.md`

### TenantModule / Module-Architektur
- `thoughts/shared/research/2026-03-25-module-architecture-services-repositories.md`

### Pre-launch Status
- `thoughts/shared/research/2026-04-22-prelaunch-status-audit.md`
- `thoughts/shared/status/2026-04-13-stand.md`

## Related Research

- R-1 Vorgänger-Bridge-Logik: `thoughts/shared/research/2026-04-24-rechnungs-uebernahme-arbeitsschein.md`
- DATEV-Surcharge-Pattern: `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`
- InboundInvoice ↔ Order: `thoughts/shared/research/2026-04-12_15-34-14_inbound-invoice-order-costcenter-bestandsaufnahme.md`
- BillingRecurringInvoice: `thoughts/shared/research/2026-03-18-ORD_05-wiederkehrende-rechnungen.md`

## Open Questions

Diese Fragen sind bewusst offen — sie gehören in die Plan-Phase, nicht
in die Research-Phase.

### Datenmodell für Soll-Werte

1. **Soll-Felder direkt am Order vs. eigene Tabelle**: Sollen
   geplante Stunden/Material/Reisezeit als zusätzliche nullable
   Spalten am `Order`-Modell leben (wie `targetHours`,
   `targetMaterial`, `targetTravelTime` aus dem Backlog-Vorschlag),
   oder als eigene `OrderBudget`/`OrderTarget`-Tabelle? Konsequenz für
   Versionierung (Re-Planung im Auftragsverlauf).

2. **Soll-Stunden je Lohngruppe**: Da Lohngruppen heute keine Entity
   sind — soll NK-1 sich an `Employee.salaryGroup`-Freitext anbinden
   (und damit eine implizite Gruppen-Definition pro Tenant
   einführen), oder eine neue `WageGroup`-Tabelle pro Tenant einführen?

3. **Pauschalpositionen mit kalkulatorischer Sollzeit**: Sind Pauschalen
   Order-Level (`Order.fixedPrice` aus R-2) oder Activity-Level oder
   eigene Position-Tabelle?

### Aggregations-Schicht

4. **Material-Bewertungspreis**: Soll NK-1 einen Snapshot-Preis am
   `WhStockMovement` (oder einer separaten `WhStockMovementValuation`-
   Tabelle) ergänzen, um historische Stabilität zu schaffen, oder live
   gegen `WhArticle.buyPrice` aggregieren mit dem Wissen, dass
   Preisänderungen retroaktiv wirken?

5. **Doppelzuordnungs-Strategie Material vs. InboundInvoice**: Soll
   die Aggregation per Order beide Pfade addieren (Risiko:
   Doppelzählung) oder einen vorrangigen Pfad pro Auftragstyp wählen
   oder eine explizite "diese Lieferantenrechnung wurde bereits über
   Lager verbucht"-Markierung?

6. **DRAFT-WorkReports**: Sollen Buchungen aus DRAFT-Scheinen als
   Ist gezählt werden (sie sind erfasst, aber nicht abgenommen) oder
   ausgeschlossen?

7. **Activity-Level-Pricing als Soll-Quelle**: Soll NK-1 schon einen
   Activity-Level-Stundensatz vorbereiten, oder bei der
   `Order.billingRatePerHour → Employee.hourlyRate`-Kette aus R-1
   bleiben?

### Datenqualitäts-Indikatoren

8. **Welche Indikatoren landen im Report-Output**: Pure Counts ("X
   Buchungen ohne Stundensatz") oder Drill-Down-Listen (Klick auf
   Indikator → konkrete betroffene Buchungen)?

9. **Schwellenwerte / Ampel-Logik**: Wer definiert die Soll/Ist-
   Ampel-Schwellen — global, pro Tenant, pro Auftragstyp?

### Architektur für NK-2+ Vorbereitung

10. **`Order.contractId`-Spalte ohne Contract-Tabelle**: Soll NK-1 die
    Spalte `contractId String?` schon einführen (mit FK-Constraint
    angedeutet, aber ohne tatsächlich existierende Contract-Tabelle),
    oder erst NK-2 einführen?

11. **Aggregations-Service Wiederverwendbarkeit**: Soll
    `calculateIstAufwand(orderId)` von Anfang an als
    parametrisierbare Funktion gebaut sein, die NK-2 in einer
    Schleife für alle untergeordneten Verträgs-Aufträge aufrufen
    kann?

### Modulgating

12. **Eigenständiges Modul oder Sub-Feature**: Wird NK-1 ein neues
    `nachkalkulation`/`controlling` Modul in `AVAILABLE_MODULES`,
    oder Sub-Feature unter einem existierenden Modul (z.B.
    `billing` oder `crm`)?

13. **Tier-Gating**: Soll NK-1 nur in Business/Enterprise-Tier
    aktivierbar sein? Heute existiert keine Tier-Logik — alle Module
    sind binär enabled/disabled. Wäre eine eigene Erweiterung
    notwendig.
