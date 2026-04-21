---
date: 2026-04-21T14:00:00+02:00
researcher: impactj90
git_commit: 4ce006b286188b0418d3b73aa81781761fad169b
branch: staging
repository: terp
topic: "Serviceobjekt-Detailseite mit Einsatz-Historie — Datenmodell-Vorbereitung (T-2)"
tags: [research, codebase, service-objects, orders, order-bookings, wh-stock-movements, crm-address-detail, dashboard, aggregates, mobile-responsive, qr-scan]
status: complete
last_updated: 2026-04-21
last_updated_by: impactj90
---

# Research: Serviceobjekt-Detailseite mit Einsatz-Historie — Datenmodell-Vorbereitung (T-2)

**Date**: 2026-04-21T14:00:00+02:00
**Researcher**: impactj90
**Git Commit**: 4ce006b286188b0418d3b73aa81781761fad169b
**Branch**: staging
**Repository**: terp

## Research Question

Vorbereitung für das Folge-Ticket zum Serviceobjekte-Modul (T-2). Nach
dem ersten Ticket (T-1, abgeschlossen 2026-04-21) existiert die Entität
`ServiceObject` mit Stammdaten, Baum, Anhängen, QR-Code und den
Foreign-Keys `Order.serviceObjectId` und `WhStockMovement.serviceObjectId`.
Die Datenbank weiß also schon, welche Aufträge und Lagerentnahmen zu
welchem Serviceobjekt gehören — aber der Nutzer sieht diese Beziehung
nirgendwo in der UI. Der QR-Scan führt auf die Detailseite, die aber
noch leer ist.

Das nächste Ticket macht diese bereits persistierten Beziehungen
sichtbar. Dokumentiert werden muss der IST-Zustand der betroffenen
Read-Queries, UI-Seiten und Widgets.

## Summary

Der IST-Zustand nach T-1-Merge:

1. **ServiceObject-Detailseite** (`/serviceobjects/[id]`) hat heute
   **exakt 3 Tabs**: „Übersicht", „Hierarchie", „Anhänge". Es gibt
   **keinen** Aufträge-Tab und **keinen** Bewegungs-Tab. Das
   Repository lädt zwar bereits `_count: { orders, stockMovements }`
   via `findById`, aber die Detail-Komponente rendert diese Werte
   nirgendwo. Tab-Mechanismus: shadcn `Tabs` mit `defaultValue`,
   **kein** URL-State.

2. **Order-Entität**: `Order.serviceObjectId` existiert nach T-1
   (nullable FK, Index gesetzt). Kunden-Verknüpfung bleibt ein
   Freitext-Feld `customer: String? @db.VarChar(255)` — es gibt
   **keine** FK von Order zu `CrmAddress`. Es gibt **kein**
   `completedAt`-Feld; Status-Änderung ist die einzige Information.
   Die tRPC-Procedure `orders.list` akzeptiert nur `isActive` und
   `status` als Filter — **kein** `serviceObjectId`-Filter.
   `OrderOutput` propagiert `serviceObjectId` nicht durchs Router-Schema.

3. **OrderBooking** ist eine eigene Tabelle mit `employeeId`,
   `orderId`, `activityId?`, `bookingDate`, `timeMinutes`,
   `description?`, `source`. Es gibt **keinen** Aggregator
   `getBookingSummary(orderId)` — keine `groupBy`/`aggregate`/`_sum`-
   Calls im `order-booking-service`. Order-Detailseite zeigt
   Buchungen als Einzelzeilen-Tabelle ohne Summenzeile.

4. **WhStockMovement**: `serviceObjectId` ist FK + Index vorhanden.
   `listWithdrawals` akzeptiert `serviceObjectId?`-Filter in
   `wh-withdrawal-service.ts:373-431`. Es gibt aber **keine**
   dedizierte `listByServiceObject`-Prozedur (Analog zu
   `listByOrder`/`listByDocument`). Article-Detail-Movements-Tab
   zeigt Spalten *Datum/Art/Menge/Bestand vorher/Bestand nachher/
   Referenz/Grund* ohne Typ-Filter (alle MovementTypes). `createdById`
   (UUID-only, keine `@relation`) wird weder in `withdrawal-history`
   noch in `article-movements-tab` gerendert. `withdrawal-history.tsx`
   hat **kein** Branch für `serviceObjectId` — solche Bewegungen
   rendern als `—`.

5. **CRM-Address-Detailseite** hat 8 Tabs (Übersicht, Kontakte,
   Bankverbindungen, Korrespondenz, Anfragen, Aufgaben, Belege,
   Kundendienst). Kein ServiceObjects-Tab post-T-1. Kein
   „Letzte-Aktivität"-Feld weder auf Adresse noch in Repository.

6. **StatsCard-Komponente** existiert
   (`src/components/dashboard/stats-card.tsx`). Nicht als
   flächendeckendes Pattern — KPI-Kacheln werden sowohl über
   `StatsCard` als auch inline (z. B. team-overview) gebaut.

7. **Dashboard** (`/dashboard`) hat 9 Widgets + Quick-Actions-Bar,
   alle hardcoded in der Page-JSX — **kein** Widget-Registry. Layout:
   4-Kartengrid oben + 2-Spalten-Sektionen.

8. **Aggregate-Patterns**: 11× `groupBy`, 4× `aggregate`, 11×
   `_count`-Include, ~30× `$queryRaw`. Kein `lastActivity`-Feld
   irgendwo. „Latest record" ausschließlich via `findFirst` +
   `orderBy desc`.

9. **Mobile**: ServiceObject-Detailseite nutzt nur `md:`-Breakpoint,
   hat **kein** `container`/`max-w-*`, feste `p-6`-Padding. Action-
   Button-Reihe hat keinen `sm:hidden`-Variant. Detailseite ist **nicht**
   explizit mobile-first.

10. **QR-Scan-Flow**: `serviceObjects.scanByQr` liefert
    `redirectUrl: /serviceobjects/${id}` (relativ, ohne Locale-Präfix).
    Route ist durch `ProtectedRoute` + `tenantProcedure` + `crm`-Modul-
    Guard abgesichert. `qr-scanner.tsx` demultiplext `TERP:ART:`/
    `TERP:SO:` über `allowedPrefixes`-Prop (Default enthält beide).
    `ScannerTerminal.handleScan` ist nicht auf SO-Demux ausgelegt.

## Detailed Findings

### 1. Bestehende Serviceobjekt-Seiten (aus T-1)

#### 1.1 Liste: `src/app/[locale]/(dashboard)/serviceobjects/page.tsx`

- Client-Component (`'use client'`).
- Filter-State: alle über `React.useState` (Z. 40–45), **kein** URL-
  State über `searchParams`.
- tRPC-Query: `useServiceObjects(params)` →
  `trpc.serviceObjects.list` (Z. 47–54).
  - Input: `{ page, pageSize: 25, search, kind, status, isActive }`
  - Output: `{ items, total }`
- Tabellen-Spalten (T-1): u. a. Nummer, Name, Kunde, Status, **Kinder**
  (`_count.children`, Z. 190). **Keine** Spalten für Orders oder
  StockMovement-Count.
- Layout: `div.space-y-4.p-6`, Filter-Grid `grid-cols-1 md:grid-cols-4`
  (Z. 77). Kein `container`/`max-w-*`.
- shadcn-Primitive: `Card`, `Input`, `Select`, `Table`, `Badge`,
  `Pagination`, `Skeleton`.
- `ServiceObjectFormSheet` eingebettet (Z. 218).

#### 1.2 Detail: `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx` (**KERN-DATEI**)

**Tab-Mechanismus:** shadcn `Tabs`-Komponente (Import Z. 10),
kontrolliert rein über `defaultValue="overview"` (Z. 91). **Kein**
URL-State, **kein** `useState` für aktiven Tab. shadcn interne
Uncontrolled-State-Verwaltung.

**Existierende Tabs (Z. 92–96):**

| `value`       | `TabsTrigger`-Label | Inhalt                                                |
|---------------|---------------------|-------------------------------------------------------|
| `overview`    | Übersicht           | Stammdaten-Card, Kind-abhängige `DetailRow`-Felder   |
| `tree`        | Hierarchie          | Parent-Link + Children-Liste (plain links)           |
| `attachments` | Anhänge             | `<AttachmentList serviceObjectId={id} />`             |

Es gibt **exakt 3 Tabs**. **Kein** „Aufträge"-Tab. **Kein**
„Lagerbewegungen"-Tab.

**tRPC-Queries:**
- `useServiceObject(id)` → `trpc.serviceObjects.getById` (Z. 30).
  Input: `{ id: string }`.
- `useDeleteServiceObject()` → `trpc.serviceObjects.delete` (Z. 31).

**Kritisches Detail — Counts werden geladen aber nicht gerendert:**
- `service-object-repository.ts:122-128` lädt `_count: { children, attachments, orders, stockMovements }` in `findById`.
- **Keine** dieser Counts wird auf der Detailseite gerendert.
- Einziger Nutzungsort: `service-object-service.ts:734-740`
  `deleteServiceObject` prüft die Counts für Soft-vs-Hard-Delete.
- `ConfirmDialog` (Z. 277–284) erwähnt im Text
  „verknüpfte Aufträge oder Bewegungen", zeigt aber **keinen** Count
  und **keine** Liste.

**Layout:** `div.space-y-4.p-6`, Tab-Content-Card-Grid
`grid-cols-1 md:grid-cols-2 gap-4` (Z. 103). Kein `container`/
`max-w-*`. Einziger verwendeter Breakpoint: `md:`.

**Weitere Komponenten:**
- `QrLabelButton` (Z. 78)
- `ServiceObjectFormSheet` Edit-Mode (Z. 248–276)
- `ConfirmDialog` (Z. 277–284)

#### 1.3 Weitere Seiten

- **Tree:** `src/app/[locale]/(dashboard)/serviceobjects/tree/page.tsx`
  nutzt `useServiceObjectTree({ customerAddressId })` +
  `ServiceObjectTreeView`.
- **Import:** `src/app/[locale]/(dashboard)/serviceobjects/import/page.tsx`
  — CSV-Wizard, Preview + Commit via Mutations.

#### 1.4 Komponenten unter `src/components/serviceobjects/`

| Datei                         | Zweck                                                          |
|-------------------------------|----------------------------------------------------------------|
| `attachment-list.tsx`         | Anhänge-Tab-Inhalt; Upload-Flow, Download, Delete             |
| `service-object-form-sheet.tsx` | Create/Edit-Sheet (shadcn Sheet `sm:max-w-xl`)              |
| `service-object-tree-view.tsx` | Baumaufbau in-memory via `buildTree()` (Z. 24–53), Auto-Expand |
| `service-object-tree-node.tsx` | Rekursive Node-Komponente mit `paddingLeft: depth*20px`       |
| `service-object-picker.tsx`   | Combobox/Select+Search; Filter `customerAddressId`, `isActive:true` |
| `qr-label-button.tsx`         | Button → `useGenerateQrPdf()`                                 |
| `labels.ts`                   | Pure Mapping-Funktionen (kindLabel, statusLabel, …)           |

**Kein** Component rendert Order- oder StockMovement-Daten.

#### 1.5 Hooks: `src/hooks/use-service-objects.ts`

16 Hooks exportiert: list, getById, tree, attachments (+ upload/
download/delete), generateSingleQr, create/update/move/delete,
generateQrPdf, import (preview/commit). **Keine** Hooks für Orders
oder StockMovements nach ServiceObject-Filter.

---

### 2. Order-Entität — Felder, Beziehungen, Filter-Prozedur

#### 2.1 `Order` Prisma-Model (`prisma/schema.prisma:2467-2503`)

Table: `orders` (`@@map`).

| Feld                  | Typ                              | Nullable | Default / Constraint |
|-----------------------|----------------------------------|----------|----------------------|
| `id`                  | `String @db.Uuid`                | nein     | `gen_random_uuid()`  |
| `tenantId`            | `String @db.Uuid`                | nein     |                      |
| `code`                | `String @db.VarChar(50)`         | nein     |                      |
| `name`                | `String @db.VarChar(255)`        | nein     |                      |
| `description`         | `String? @db.Text`               | ja       |                      |
| `status`              | `String @db.VarChar(20)`         | nein     | `"active"` (CHECK: `planned`, `active`, `completed`, `cancelled`) |
| `customer`            | `String? @db.VarChar(255)`       | ja       | **Freitext**         |
| `costCenterId`        | `String? @db.Uuid`               | ja       | FK → `CostCenter`    |
| `billingRatePerHour`  | `Decimal? @db.Decimal(10,2)`     | ja       |                      |
| `validFrom`           | `DateTime? @db.Date`             | ja       |                      |
| `validTo`             | `DateTime? @db.Date`             | ja       |                      |
| `isActive`            | `Boolean`                        | nein     | `true`               |
| `createdAt`           | `DateTime @db.Timestamptz(6)`    | nein     | `now()`              |
| `updatedAt`           | `DateTime @db.Timestamptz(6)`    | nein     | `now()`, trigger     |
| `serviceObjectId`     | `String? @db.Uuid`               | **ja**   | FK → `ServiceObject` (post-T-1, Z. 2482), `onDelete: SetNull` |

**Kein `OrderStatus`- oder `OrderType`-Prisma-Enum** — Status ist
VARCHAR + DB-CHECK. **Kein `completedAt`/`closedAt`/`doneAt`**
Timestamp. **Keine** `OrderStatusHistory`-Tabelle.

**Relationen:** `tenant`, `costCenter`, `serviceObject`,
`assignments` (OrderAssignment[]), `orderBookings`, `crmInquiries`,
`billingDocuments`, `billingServiceCases`, `inboundInvoices`,
`defaultForEmployees` (Employee via `EmployeeDefaultOrder`).

**Indizes:**
- `@@unique([tenantId, code])`
- `@@index([tenantId])`, `[tenantId, isActive]`, `[tenantId, status]`, `[costCenterId]`
- `@@index([tenantId, serviceObjectId])` (post-T-1)

#### 2.2 `OrderAssignment` (`schema.prisma:2514-2537`)

Table: `order_assignments`.

| Feld        | Typ                       | Notes                                              |
|-------------|---------------------------|----------------------------------------------------|
| `id`        | `String @db.Uuid`         |                                                    |
| `tenantId`  | `String @db.Uuid`         |                                                    |
| `orderId`   | `String @db.Uuid`         | FK → `Order`, cascade delete                       |
| `employeeId`| `String @db.Uuid`         | FK → `Employee`, cascade delete                    |
| `role`      | `String @db.VarChar(20)`  | default `"worker"`, CHECK: `worker`/`leader`/`sales` |
| `validFrom` | `DateTime? @db.Date`      |                                                    |
| `validTo`   | `DateTime? @db.Date`      |                                                    |
| `isActive`  | `Boolean`                 | default `true`                                     |
| `createdAt` | `DateTime`                |                                                    |
| `updatedAt` | `DateTime`                |                                                    |

Unique: `@@unique([orderId, employeeId, role])`. Verknüpft zu
**Employee**, nicht zu `User`. `order-assignment-repository.ts:13-20`
selektiert `firstName`, `lastName`, `personnelNumber` aus Employee.

**Nicht existent:** `OrderItem`, `OrderComment`, `OrderLabel`,
`OrderStatusHistory`.

#### 2.3 Kunden-Verknüpfung

- **Einzig** der Freitext `customer: String?` (Z. 2474).
- **Keine** FK von `Order` zu `CrmAddress`.
- Indirekter Weg zum Kunden: `Order.serviceObjectId` →
  `ServiceObject.customerAddressId` → `CrmAddress`
  (schema.prisma:924 + 963).

#### 2.4 tRPC-Router: `src/trpc/routers/orders.ts`

Alle Procedures via `tenantProcedure` + `requirePermission(ORDERS_MANAGE)`.

| Procedure       | Typ      | Input                                      | Output                 |
|-----------------|----------|--------------------------------------------|------------------------|
| `list`          | query    | `{ isActive?: boolean; status?: string }`  | `{ data: OrderOutput[] }` |
| `getById`       | query    | `{ id: string }`                           | `OrderOutput`          |
| `create`        | mutation | `createOrderInputSchema`                   | `OrderOutput`          |
| `update`        | mutation | `updateOrderInputSchema`                   | `OrderOutput`          |
| `delete`        | mutation | `{ id: string }`                           | `{ success: boolean }` |

**`orders.list` akzeptiert KEINEN `serviceObjectId`-Filter**
(Z. 144). **`OrderOutput`-Schema** (Z. 38-54) enthält
`serviceObjectId` **nicht** im Output:

```
id, tenantId, code, name, description, status, customer,
costCenterId, costCenter: { id, code, name } | null,
billingRatePerHour: number | null, validFrom, validTo,
isActive, createdAt, updatedAt
```

`mapOrderToOutput` (Z. 91–128) konvertiert `Prisma.Decimal` zu
`number`, lässt `serviceObjectId` weg.

#### 2.5 Service + Repository

Dateien unter `src/lib/services/`:

| Datei                               | Exports                                                                                  |
|-------------------------------------|------------------------------------------------------------------------------------------|
| `order-service.ts`                  | `list`, `getById`, `create`, `update`, `remove`                                          |
| `order-repository.ts`               | `findMany`, `findById`, `findByCode`, `create`, `findByIdWithInclude`, `update`, `deleteById` |
| `order-assignment-service.ts`       | `list`, `getById`, `byOrder`, `create`, `update`, `remove`                              |
| `order-assignment-repository.ts`    | `findMany`, `findById`, `findByIdSimple`, `findByOrder`, `create`, `findByIdWithIncludes`, `update`, `deleteById` |
| `order-booking-service.ts`          | `list`, `getById`, `create`, `update`, `remove`                                          |
| `order-booking-repository.ts`       | `findMany`, `findById`, `findByIdSimple`, `findEmployee`, `findOrder`, `findActivity`, `create`, `findByIdWithInclude`, `update`, `deleteById` |

`order-repository.ts:findMany` (Z. 21–34): `where` nur `tenantId` +
optionale `isActive`/`status`. **Keine** Customer- oder ServiceObject-
Filterung in Repository. Customer-Filter läuft **client-seitig** in
`src/app/[locale]/(dashboard)/admin/orders/page.tsx:77-86` via
`o.customer?.toLowerCase().includes(s)`.

`orderInclude` (Z. 10-14): selektiert nur `costCenter: { id, code, name }`.
**ServiceObject-Include existiert nirgendwo** im Order-Repository.

#### 2.6 Admin-Orders-Page: `src/app/[locale]/(dashboard)/admin/orders/page.tsx`

- Query: `trpc.orders.list` via `useOrders`, Z. 57, **ohne** Filter
  (`{}`) — holt alle Orders.
- Filter-UI: nur `SearchInput` (freitext), Z. 183. Client-seitiges
  `filteredOrders` (Z. 77–86) matcht gegen `code`, `name`, `customer`.
  **Kein** Status-Dropdown, **keine** Date-Range.
- **Keine** Pagination — `OrderDataTable` rendert alles.

**Spalten** (`src/components/orders/order-data-table.tsx:72-79`):

| # | Label (i18n-Key)   | Inhalt                                               |
|---|--------------------|------------------------------------------------------|
| 1 | `columnCode`       | `item.code` (monospace)                              |
| 2 | `columnName`       | `item.name` + `Package`-Icon                         |
| 3 | `columnStatus`     | `<OrderStatusBadge status={item.status} />`          |
| 4 | `columnCustomer`   | `item.customer \|\| '-'`                            |
| 5 | `columnValidFrom`  | `dd.MM.yyyy`                                         |
| 6 | `columnValidTo`    | `dd.MM.yyyy`                                         |
| 7 | Actions            | Dropdown (View / Edit / Delete)                      |

Order-Detailseite (`admin/orders/[id]/page.tsx`) hat 4 Tabs:
Details, Assignments, Bookings, Inbound Invoices.

---

### 3. OrderBooking / TimeEntry — Wie Stunden pro Order gebucht werden

#### 3.1 `OrderBooking` (`prisma/schema.prisma:5239-5268`)

Table: `order_bookings`.

| Feld           | Typ                                  | Nullable | Notes                                  |
|----------------|--------------------------------------|----------|----------------------------------------|
| `id`           | `String @id`                         | nein     | `gen_random_uuid()`                    |
| `tenantId`     | `String @db.Uuid`                    | nein     |                                        |
| `employeeId`   | `String @db.Uuid`                    | nein     | FK → `Employee`, cascade delete         |
| `orderId`      | `String @db.Uuid`                    | **nein** | **Non-null** FK → `Order`, cascade     |
| `activityId`   | `String? @db.Uuid`                   | ja       | FK → `Activity`, onDelete SetNull       |
| `bookingDate`  | `DateTime @db.Date`                  | nein     |                                        |
| `timeMinutes`  | `Int @db.Integer`                    | nein     | **Minuten**, nicht Stunden             |
| `description`  | `String? @db.Text`                   | ja       |                                        |
| `source`       | `String @db.VarChar(20)`             | nein     | default `"manual"` (`manual`/`auto`/`import`) |
| `createdAt`    | `DateTime @default(now())`           | nein     |                                        |
| `updatedAt`    | `DateTime @updatedAt`                | nein     |                                        |
| `createdBy`    | `String? @db.Uuid`                   | ja       |                                        |
| `updatedBy`    | `String? @db.Uuid`                   | ja       |                                        |

**Relationen:** `tenant`, `employee`, `order`, `activity?`.

**Indizes:**
- `@@index([tenantId])`, `[employeeId]`, `[orderId]`, `[activityId]`
- `@@index([tenantId, employeeId, bookingDate])`
- `@@index([tenantId, orderId, bookingDate])`

**`OrderBooking` hat keine `serviceObjectId`-Spalte.** Der Weg von
Booking → ServiceObject ist zwei-hop:
`OrderBooking.orderId` → `Order.serviceObjectId` → `ServiceObject`.

#### 3.2 Weitere Modelle mit `orderId`

- `CrmInquiry.orderId` — nullable
- `BillingDocument.orderId` — nullable (Z. 1021)
- `BillingServiceCase.orderId` — nullable (Z. 1216)
- `InboundInvoice.orderId` — nullable (Z. 6164)
- `WhStockMovement.orderId` — nullable (Z. 5528)
- `OrderAssignment.orderId` — **non-null**

#### 3.3 Nicht existente Modelle

`TimeEntry`, `Timesheet`, `WorkEntry`, `TimeRecord` existieren **nicht**
im Schema.

#### 3.4 `Booking` (Stempel-Modell, `schema.prisma:4791-4835`)

Zeit-Stempel-Modell (Kommen/Gehen), **kein** `orderId`. Keyed auf
Employee + Datum. Nicht relevant für Order-Stunden.

#### 3.5 `DailyValue` (`schema.prisma:4853-4901`)

Aggregiertes Tages-Value-Modell pro Employee+Datum. **Kein**
`orderId`. Felder: `grossTime`, `netTime`, `targetTime`, `overtime`,
`undertime`, `breakTime`, `hasError`, `errorCodes`, `warnings`,
`firstCome`, `lastGo`, `bookingCount`, `calculatedAt`,
`calculationVersion`. Unique auf `(employeeId, valueDate)`.

#### 3.6 Aggregator — existiert **nicht**

Keine Funktion wie `getBookingSummary(orderId)` in
`src/lib/services/`. `order-booking-service.ts` und `-repository.ts`
enthalten **keine** `aggregate`-, `groupBy`- oder `_sum`-Calls.
Funktionen sind ausschließlich row-level (`findMany`, `findFirst`,
`create`, `update`, `deleteMany`).

#### 3.7 Order-Detail UI — Bookings-Tab

`src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`: 4 Tabs
(Details, Assignments, Bookings, Inbound Invoices).

Bookings-Tab (Z. 88–91):
```ts
const { data: bookingsData, isLoading: bookingsLoading } = useOrderBookings({
  orderId,
  enabled: !authLoading && !permLoading && canAccess && !!orderId,
})
const bookings = bookingsData?.items ?? []
```

`useOrderBookings` (`src/hooks/use-order-bookings.ts:23`) ruft
`trpc.orderBookings.list`. Procedure
`src/trpc/routers/orderBookings.ts:227`.

`OrderBookingDataTable`-Spalten: Date, Employee, Activity, **Time**
(formatiert als `H:MM`), Description, Source, Actions. **Keine**
Summenzeile. **Keine** „Gesamt-Stunden"-Stats-Card.

#### 3.8 Aggregations-Hooks — existieren nicht

Keine Hooks wie `useOrderBookingSummary` / `useOrderHours` /
`useOrderTotalMinutes`. Alle Hooks in `use-order-bookings.ts` sind
row-level (list/getById/create/update/delete).

---

### 4. WhStockMovement — Materialverbrauch pro Serviceobjekt

#### 4.1 `WhStockMovement` Prisma-Model (`schema.prisma:5515-5551`)

Table: `wh_stock_movements`.

**Scalar-Felder:**

| Feld                    | Typ                         | Notes                                   |
|-------------------------|-----------------------------|-----------------------------------------|
| `id`                    | `String @id @db.Uuid`       | `gen_random_uuid()`                     |
| `tenantId`              | `String @db.Uuid`           |                                         |
| `articleId`             | `String @db.Uuid`           |                                         |
| `type`                  | `WhStockMovementType`       | Enum (s. u.)                            |
| `quantity`              | `Float`                     | negativ für Withdrawals/Reversals       |
| `previousStock`         | `Float`                     |                                         |
| `newStock`              | `Float`                     |                                         |
| `date`                  | `DateTime @db.Timestamptz(6)` | `@default(now())`                     |
| `purchaseOrderId`       | `String? @db.Uuid`          | FK → `WhPurchaseOrder`                  |
| `purchaseOrderPositionId` | `String? @db.Uuid`        |                                         |
| `documentId`            | `String? @db.Uuid`          | kein `@relation`                        |
| `orderId`               | `String? @db.Uuid`          | kein `@relation`                        |
| `inventorySessionId`    | `String? @db.Uuid`          | FK → `WhStocktake`                      |
| `machineId`             | `String?`                   | **Freitext, kein `@db.Uuid`**           |
| `serviceObjectId`       | `String? @db.Uuid`          | FK → `ServiceObject` (**post-T-1**), SetNull |
| `reason`                | `String?`                   |                                         |
| `notes`                 | `String?`                   |                                         |
| `createdById`           | `String? @db.Uuid`          | **Kein `@relation`** — nackte UUID      |
| `createdAt`             | `DateTime @db.Timestamptz(6)` | `@default(now())`                      |

**`@relation`-Deklarationen (Z. 5538-5542):**
- `tenant` → `Tenant`
- `article` → `WhArticle`
- `purchaseOrder` → `WhPurchaseOrder?` (SetNull)
- `stocktake` → `WhStocktake?` (SetNull)
- `serviceObject` → `ServiceObject?` (SetNull)

**Kein** `@relation` für `createdById`, `orderId`, `documentId`,
`machineId`.

**Indizes (Z. 5544-5549):**
```
@@index([tenantId, articleId])
@@index([tenantId, type])
@@index([tenantId, date])
@@index([tenantId, purchaseOrderId])
@@index([tenantId, machineId])
@@index([tenantId, serviceObjectId])
```

#### 4.2 Enum `WhStockMovementType` (`schema.prisma:5404-5413`)

Werte:
- `GOODS_RECEIPT`
- `WITHDRAWAL`
- `ADJUSTMENT`
- `INVENTORY`
- `RETURN`
- `DELIVERY_NOTE`

#### 4.3 Filter nach `serviceObjectId` — existent via `listWithdrawals`

`src/lib/services/wh-withdrawal-service.ts:373-431` —
`listWithdrawals` akzeptiert `serviceObjectId?: string` im `params`-
Object und setzt (Z. 404):
```ts
if (params.serviceObjectId) {
  where.serviceObjectId = params.serviceObjectId
}
```
`where` gilt für `prisma.whStockMovement.findMany` gefiltert auf
`type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] }`.

**Keine dedizierte Funktion** `listByServiceObject` — analog zu
bestehendem `listByOrder` (Z. 433) und `listByDocument` (Z. 449).

**`wh-stock-movement-repository.ts:findMany` und
`wh-stock-movement-service.ts:listMovements` akzeptieren
`serviceObjectId` NICHT.**

#### 4.4 Article-Detail Movements-Tab

Page: `src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx`
→ rendert `<ArticleDetail articleId={params.id} />`.

`ArticleDetail` (`src/components/warehouse/article-detail.tsx:259`)
→ Tab "stock" rendert `<ArticleMovementsTab articleId={articleId} />`.

`ArticleMovementsTab` (`src/components/warehouse/article-movements-tab.tsx`):
- Hook: `useWhArticleMovements(articleId)`
  (`src/hooks/use-wh-stock-movements.ts:55-63`)
  → `trpc.warehouse.stockMovements.movements.listByArticle`.
- Procedure: `src/trpc/routers/warehouse/stockMovements.ts:168-180`
  → `stockMovementService.listByArticle(prisma, tenantId, articleId)`
  → `repo.findByArticle` (`wh-stock-movement-repository.ts:62-78`).
- Query: `prisma.whStockMovement.findMany` mit
  `where: { tenantId, articleId }`, `include: { purchaseOrder: { select: { id, number } } }`,
  `orderBy: date desc`, `take: 50`.
- **Kein Typ-Filter** — alle MovementTypes.

**Spalten** (`article-movements-tab.tsx:86-94`, i18n-Keys in
`messages/de.json:6443-6450`):

| i18n-Key          | Label             |
|-------------------|-------------------|
| `colDate`         | Datum             |
| `colType`         | Art               |
| `colQuantity`     | Menge             |
| `colPreviousStock`| Bestand vorher    |
| `colNewStock`     | Bestand nachher   |
| `colReference`    | Referenz          |
| `colReason`       | Grund             |

Referenz-Zelle rendert `movement.purchaseOrder?.number || '—'`
(Z. 119–126). **Kein** Rendering von `orderId`, `machineId`,
`serviceObjectId`, `documentId`.

`typeVariants` / `typeKeys` (Z. 14-28) decken `GOODS_RECEIPT`,
`WITHDRAWAL`, `ADJUSTMENT`, `INVENTORY`, `RETURN` ab.
**`DELIVERY_NOTE` fehlt** — wäre `undefined` im Mapping.

#### 4.5 `createdById` — Wer hat entnommen

- Feld: `createdById` (`String? @db.Uuid`, `schema.prisma:5535`).
- **Kein `@relation`** — nackte UUID.
- Geschrieben in:
  - `wh-withdrawal-service.ts:133` (`createWithdrawal`)
  - `wh-withdrawal-service.ts:232` (`createBatchWithdrawal`)
  - `wh-withdrawal-service.ts:334` (`cancelWithdrawal` Reversal)
- `wh-stock-movement-repository.ts:findByArticle` inkludiert
  `createdById` nicht explizit (kommt via Prisma-Default mit).
- **UI rendert den User nirgendwo** — weder
  `withdrawal-history.tsx` noch `article-movements-tab.tsx`
  zeigen User/Name.
- i18n-Keys `colUser` (`de.json:6503`, „Benutzer") und
  `colCreatedBy` (`de.json:6451`, „Erstellt von") existieren,
  werden aber in keiner Tabelle genutzt.

#### 4.6 Withdrawal-Terminal (`src/components/warehouse/withdrawal-terminal.tsx`)

Post-T-1 SERVICE_OBJECT-Integration ist vollständig:
- `ReferenceType` Union enthält `'SERVICE_OBJECT'` (Z. 35).
- `REF_TYPE_CONFIG` Eintrag (Z. 85-90):
  `{ value: 'SERVICE_OBJECT', labelKey: 'refTypeServiceObject', descKey: 'refTypeServiceObjectDesc', icon: Building2 }`
- `WithdrawalState.serviceObjectId: string` (Z. 49), init `''` (Z. 103).
- `canProceedFromStep1()` prüft `state.serviceObjectId.trim().length > 0`
  (Z. 130-131).
- Step 1 Reference-Input-Block (Z. 346-388): rendert
  `<ServiceObjectPicker>` (Import Z. 29) wenn
  `referenceType === 'SERVICE_OBJECT'`.
- `handleWithdraw` (Z. 190-193) passt
  `serviceObjectId` bedingt an Mutation.
- `getReferenceValue()` (Z. 229-235) gibt `state.serviceObjectId || '—'`
  zurück — also **rohe UUID** in Step 2/3-Summary (kein Name).

#### 4.7 Withdrawal-History (`src/components/warehouse/withdrawal-history.tsx`)

- `ReferenceDisplay` (Z. 37-65): rendert `orderId`, `documentId`,
  `machineId`. **Kein Branch für `serviceObjectId`** — solche
  Movements rendern als `—` (final fallback Z. 64).
- `useWhWithdrawals` (Z. 76-81) passes nur `dateFrom`, `dateTo`,
  `page`, `pageSize` — **kein** `serviceObjectId`-Filter.

#### 4.8 tRPC-Router `src/trpc/routers/warehouse/withdrawals.ts`

Alle via `whProcedure` + `requireModule("warehouse")` (Z. 21).

| Procedure         | Typ      | Permission          | `serviceObjectId` im Input? |
|-------------------|----------|---------------------|------------------------------|
| `create`          | mutation | `wh_stock.manage`   | Ja (Z. 43, optional UUID)   |
| `createBatch`     | mutation | `wh_stock.manage`   | Ja (Z. 73, optional UUID)   |
| `cancel`          | mutation | `wh_stock.manage`   | Nein                         |
| `list`            | query    | `wh_stock.view`     | Ja (Z. 133, optional UUID)  |
| `listByOrder`     | query    | `wh_stock.view`     | Nein                         |
| `listByDocument`  | query    | `wh_stock.view`     | Nein                         |

**Keine dedizierte `listByServiceObject`-Procedure.** Einzige
Filterroute: `list` + optionaler `serviceObjectId`.

Hook `useWhWithdrawals` (`src/hooks/use-wh-withdrawals.ts:6-33`)
akzeptiert `serviceObjectId` **nicht** als Option — Parameter-Type
lässt es weg.

---

### 5. CRM-Address-Detailseite + StatCard-Patterns

#### 5.1 `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`

- Client-Component (`'use client'`, Z. 1).
- Tab-Mechanismus: shadcn `Tabs` mit `defaultValue="overview"`
  (Z. 257). **Kein** URL-State, **kein** `useState` für Tab.

**8 Tabs** (`messages/de.json:5655-5662`):

| `value`         | German-Label     | Komponente                                              |
|-----------------|------------------|---------------------------------------------------------|
| `overview`      | Übersicht        | Inline-Cards + `AddressGroupSection` (Z. 270–357)       |
| `contacts`      | Kontakte         | `<ContactList>` (Z. 361)                                |
| `bankAccounts`  | Bankverbindungen | `<BankAccountList>` (Z. 378)                            |
| `correspondence`| Korrespondenz    | `<CorrespondenceList addressId={...}>` (Z. 395)         |
| `inquiries`     | Anfragen         | `<InquiryList addressId={...}>` (Z. 399)                |
| `tasks`         | Aufgaben         | `<TaskList addressId={...}>` (Z. 403)                   |
| `documents`     | Belege           | `<BillingDocumentList addressId={...}>` (Z. 407)        |
| `serviceCases`  | Kundendienst     | `<ServiceCaseList addressId={...}>` (Z. 411)            |

**Kein ServiceObjects-Tab.** Zero matches für „serviceobject"/
„Serviceobjekte" im gesamten Page-File.

**Daten-Query:** Einzige Call (Z. 52):
```ts
const { data: address, isLoading } = useCrmAddress(params.id, canAccess !== false)
```
`useCrmAddress` (`src/hooks/use-crm-addresses.ts:32-40`) →
`trpc.crm.addresses.getById`. Liefert eingebettete Sub-Collections
(`contacts`, `bankAccounts`, `parentAddress`, `childAddresses`,
`salesPriceList`, `purchasePriceList`).

**Keine KPI-Tiles.** Detail-Seite hat überhaupt keine Stat-Cards.

#### 5.2 StatsCard-Komponente

**Datei:** `src/components/dashboard/stats-card.tsx`

```ts
interface StatsCardProps {
  title: string
  value: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  isLoading?: boolean
  error?: Error | null
  className?: string
}
```

Rendert `div.rounded-lg.border.bg-card` (Z. 73-101) — **kein**
shadcn `Card`. Begleitet von `StatsCardSkeleton` (Z. 107-120).
Barrel-Export in `src/components/dashboard/index.ts:7-8`.

**Verwendungen (Beispiele):**

- `src/components/warehouse/corrections/wh-correction-dashboard.tsx:38-61`
  — 3-Kachel-Grid `md:grid-cols-3` (open errors, warnings, infos)
  via `useWhCorrectionSummary()`.
- `src/components/warehouse/dashboard/stock-value-card.tsx:17-27` —
  Dünner Wrapper → `StatsCard`.
- `src/components/warehouse/dashboard/open-orders-card.tsx:19-33` —
  Summiert zwei `useWhPurchaseOrders`-Calls.

**Inline-KPI (nicht via StatsCard):**
- `src/components/team-overview/team-stats-cards.tsx:138-274` —
  raw `div.rounded-xl.border.bg-card` mit farbigen Icon-Backgrounds
  (`bg-emerald-500/10`, `bg-blue-500/10`).

CRM-Address-Detail und Warehouse-Article-Detail haben **überhaupt
keine** KPI-Kachel-Grids.

#### 5.3 „Letzte Aktivität"-Indikator — existiert nicht

Keines dieser Files enthält `lastActivity`/`lastContact`/
`latestInteraction`/`lastContactAt`/`last_activity`/`last_contact`:

- `src/lib/services/crm-address-service.ts`
- `src/lib/services/crm-address-repository.ts`
- `src/components/crm/address-data-table.tsx`
- `src/app/[locale]/(dashboard)/crm/addresses/page.tsx`

**Kein** „X Tage ago"-Badge, **kein** Dot-Indikator, **keine**
Last-Contact-Spalte. Der einzige `lastActivity`-Treffer im gesamten
Repo ist die Platform-JWT-Sliding-Session (`src/lib/platform/jwt.ts`)
— eine Unix-Timestamp-Claim, kein DB-Feld.

#### 5.4 Präzedenz: „Verknüpfte Orders"-Widget in anderen Detail-Seiten

**InquiryDetail** (`src/components/crm/inquiry-detail.tsx:246-264`) —
Inline-`DetailRow` im Übersicht-Tab, zeigt den verknüpften Order;
bei `null` Button „Verknüpfen".

**ServiceCaseDetail** (`src/components/billing/service-case-detail.tsx:229-275`)
— `md:col-span-2` „Links"-Card mit verknüpftem Order, Invoice, Inquiry
als Zeilen.

**`BillingDocumentList`** (`src/components/billing/document-list.tsx`)
— Tab-Inhalt auf CRM-Address-Detail (`documents`-Tab); filtert
Dokumente per `addressId`. **Nächstgelegene Präzedenz** für einen
Tab, der eine Liste verknüpfter Orders/Entities enthält.

---

### 6. Haupt-Dashboard — Widgets + Struktur

#### 6.1 Routing

- `src/app/[locale]/page.tsx` — Redirect-Gate. Pusht zu `/dashboard`
  wenn authentifiziert, sonst `/login` (Z. 13-21).
- **Haupt-Dashboard:** `src/app/[locale]/(dashboard)/dashboard/page.tsx`

#### 6.2 Layout

- `src/app/[locale]/(dashboard)/layout.tsx` — wickelt alle
  Dashboard-Pages in `<AppLayout>`.
- `src/components/layout/app-layout.tsx:38-47` — `SidebarInset`
  mit Content-Wrapper:
```
flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 lg:p-6
pb-[calc(var(--bottom-nav-height)+var(--safe-area-bottom)+1rem)] lg:pb-6
```
  **Kein** `max-w-*`-Container.

#### 6.3 Dashboard-Page-Struktur

`src/app/[locale]/(dashboard)/dashboard/page.tsx`, `'use client'`:

- Outer-Wrapper: `space-y-4 sm:space-y-6` (Z. 35).
- **Sektion 1 — Header** (Z. 37): `<DashboardHeader user={user} />`
- **Sektion 2 — Quick-Actions** (Z. 42): `<QuickActions employeeId={employeeId} />`
- **Sektion 3 — Stat-Grid** (Z. 45-50):
  `grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4` — 4 Stat-Cards.
- **Sektion 4 — Activity-Section** (Z. 53-56):
  `grid gap-4 sm:gap-6 lg:grid-cols-2` — `PendingActions` + `RecentActivity`.
- **Sektion 5 — HR-Widgets** (Z. 75-80):
  `grid gap-4 sm:gap-6 lg:grid-cols-2` — bedingt sichtbar.

**Kein Widget-Registry.** Kein `WIDGET_MAP`, keine Config-Array,
keine `widgetId→component`-Mapping. Alle Widgets werden direkt als
JSX eingebaut.

#### 6.4 Widget-Inventar (10 Elemente)

| # | Widget                          | Datei                                                      | Datenquelle (tRPC)                                                   |
|---|---------------------------------|------------------------------------------------------------|----------------------------------------------------------------------|
| 1 | `DashboardHeader`               | `src/components/dashboard/dashboard-header.tsx`            | keine                                                                |
| 2 | `QuickActions`                  | `src/components/dashboard/quick-actions.tsx`               | `employees.dayView`, `bookingTypes.list`, `bookings.create`          |
| 3 | `TodayScheduleCard`             | `src/components/dashboard/today-schedule-card.tsx`         | `employees.dayView`                                                  |
| 4 | `HoursThisWeekCard`             | `src/components/dashboard/hours-this-week-card.tsx`        | `dailyValues.list`                                                   |
| 5 | `VacationBalanceCard`           | `src/components/dashboard/vacation-balance-card.tsx`       | `vacation.getBalance`                                                |
| 6 | `FlextimeBalanceCard`           | `src/components/dashboard/flextime-balance-card.tsx`       | `monthlyValues.forEmployee`                                          |
| 7 | `PendingActions`                | `src/components/dashboard/pending-actions.tsx`             | `dailyValues.list`                                                   |
| 8 | `RecentActivity`                | `src/components/dashboard/recent-activity.tsx`             | `bookings.list`                                                      |
| 9 | `PersonnelFileDashboardWidget`  | `src/components/hr/personnel-file-dashboard-widget.tsx`    | `hr.personnelFile.entries.getReminders` + `getExpiring`              |
| 10| `ProbationDashboardWidget`      | `src/components/dashboard/probation-dashboard-widget.tsx`  | `employees.probationDashboard`                                       |

**StatsCard** existiert in `src/components/dashboard/stats-card.tsx`,
wird aber von den 4 Top-Stat-Cards **nicht** als Composition genutzt —
diese implementieren ihre Card-Struktur direkt.

#### 6.5 Platform-Dashboard (Kontext)

`src/app/platform/(authed)/dashboard/page.tsx` — separate Operator-
Seite mit 4 Stat-Cards (Offene Anfragen, Aktive Sessions,
Convert-Anfragen, Audit-Events) + 2 Listen-Panels. Nutzt
`usePlatformTRPC()`. Nicht teil der Tenant-Seite.

---

### 7. Aggregate-Query-Patterns

#### 7.1 `groupBy` — 11 Usages

**Beispiel A** — CRM-Adressen nach Typ zählen
(`src/lib/services/crm-report-service.ts:76-94`):
```ts
prisma.crmAddress.groupBy({
  by: ["type"],
  where: where as Prisma.CrmAddressWhereInput,
  _count: true,
})
```

**Beispiel B** — Daily-Account-Values per Employee+Account mit Sum
(`src/lib/services/payroll-export-repository.ts:200-209`):
```ts
prisma.dailyAccountValue.groupBy({
  by: ['employeeId', 'accountId'],
  where: { tenantId, employeeId: { in: employeeIds }, ... },
  _sum: { valueMinutes: true },
})
```

**Beispiel C** — Top-10-Adressen nach Inquiry-Count
(`src/lib/services/crm-report-service.ts:199-205`):
```ts
prisma.crmInquiry.groupBy({
  by: ["addressId"],
  where: where as Prisma.CrmInquiryWhereInput,
  _count: true,
  orderBy: { _count: { addressId: "desc" } },
  take: 10,
})
```
Gefolgt von zweitem `findMany` zum Auflösen der Adressnamen für die
Top-10-IDs (Z. 219-227).

Weitere Nutzungen: `wh-correction-repository.ts:169-173`
(`_count: { id: true }`), `export-context-builder.ts:507-513`
(Overtime-Payouts per Employee), `crm-report-service.ts:254-265`
(CrmInquiry nach Effort).

#### 7.2 `aggregate` — 4 Usages

**Beispiel A** — Overtime-Payout-Sum
(`src/lib/services/overtime-payout-repository.ts:134-138`):
```ts
const result = await prisma.overtimePayout.aggregate({
  where: { tenantId, employeeId, year, month, status: "approved" },
  _sum: { payoutMinutes: true },
})
return result._sum.payoutMinutes ?? 0
```

**Beispiel B** — Invoice- minus Credit-Note-Aggregate für Gruppe
(`src/lib/services/crm-address-service.ts:544-562`):
```ts
const [invoiceAgg, creditAgg, documentCount] = await Promise.all([
  prisma.billingDocument.aggregate({
    where: invoiceWhere,
    _sum: { subtotalNet: true, totalGross: true },
  }),
  prisma.billingDocument.aggregate({
    where: creditWhere,
    _sum: { subtotalNet: true, totalGross: true },
  }),
  prisma.billingDocument.count({ where: { ... } }),
])
```

**Beispiel C** — Reservierte Menge
(`src/lib/services/wh-reservation-repository.ts:69-73`):
```ts
const result = await prisma.whStockReservation.aggregate({
  where: { tenantId, articleId, status: "ACTIVE" },
  _sum: { quantity: true },
})
return result._sum.quantity || 0
```

#### 7.3 `_count`-Include — 11 Usages

**Beispiel A** — Multi-Field-Count als Konstante
(`src/lib/services/billing-price-list-repository.ts:11-13`):
```ts
const LIST_INCLUDE = {
  _count: { select: { entries: true, salesAddresses: true, purchaseAddresses: true } },
}
```

**Beispiel B** — Single-Count in List-Query
(`src/lib/services/crm-address-repository.ts:51-53`):
```ts
prisma.crmAddress.findMany({
  where, orderBy: { company: "asc" },
  skip: (params.page - 1) * params.pageSize, take: params.pageSize,
  include: { _count: { select: { childAddresses: true } } },
})
```

**Beispiel C** — Mixed (reale Relation + _count)
(`src/lib/services/crm-correspondence-repository.ts:67-70`):
```ts
prisma.crmCorrespondence.findMany({
  where, orderBy: { date: "desc" },
  include: {
    contact: true,
    _count: { select: { correspondenceAttachments: true } },
  },
})
```

**Beispiel D** — ServiceObject-Repository
(`src/lib/services/service-object-repository.ts:85`):
```ts
_count: { select: { children: true, attachments: true } },
```

`findById` (gleiche Datei, Z. 122-128) nutzt vollständigere Variante:
`_count: { select: { children: true, attachments: true, orders: true, stockMovements: true } }`.

#### 7.4 `$queryRaw` — ~30 Usages in 16 Files

Alle via tagged-template `Prisma.sql`. `$queryRawUnsafe` wird
**nicht** genutzt.

Wichtigste Patterns:

- **COUNT + paginierte IDs in einem `Promise.all`**
  (`probation-repository.ts:233-251`):
```ts
const [countRows, idRows] = await Promise.all([
  prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS total FROM employees e WHERE ${whereSql}
  `),
  prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT e.id FROM employees e WHERE ${whereSql}
    ORDER BY e.last_name ASC, e.first_name ASC, e.id ASC
    LIMIT ${params.take} OFFSET ${params.skip}
  `),
])
```

- **`date_trunc` GROUP BY + App-Pivot**
  (`crm-report-service.ts:107-147`):
```ts
prisma.$queryRaw<...>(Prisma.sql`
  SELECT date_trunc(${truncUnit}, date) AS period, direction, COUNT(*)::int AS count
  FROM crm_correspondences
  WHERE tenant_id = ${tenantId}::uuid
    AND date >= ${new Date(params.dateFrom)}
    AND date <= ${new Date(params.dateTo)}
  GROUP BY period, direction ORDER BY period
`)
```

- **MAX(...)** für Auto-Increment (`employees-repository.ts:186-189`).
- **COUNT(*)::bigint** Scalar (`bank-statement-service.ts:220-226`).

#### 7.5 `crm-address-service.ts` — Per-Address-Counts

`getGroupStats()` (Z. 493) zählt **nicht** Anfragen/Korrespondenz/
Aufgaben pro Adresse — nur `billingDocument.aggregate` +
`countChildren`. Per-Address-Counts für Anfragen/Korrespondenz/
Aufgaben **existieren nirgends** im Codebase.

Report-Level-Varianten in `crm-report-service.ts` nutzen `groupBy`
auf Entity-Tabellen gefiltert nur per `tenantId`, nicht per
`addressId`.

#### 7.6 „Latest-Record" — via `findFirst` + `orderBy desc`

**Kein** `lastActivity`/`lastInteraction`/`lastContactAt`-Feld in
irgendeinem Prisma-Modell. Einzige `lastActivity`-Referenz ist der
Platform-JWT-Sliding-Session-Claim.

**Muster-Beispiele:**

- Höchste Mahnstufe (`reminder-level-helper.ts:14-22`):
```ts
prisma.reminderItem.findFirst({
  where: { billingDocumentId, reminder: { status: "SENT" } },
  orderBy: { levelAtReminder: "desc" },
  select: { levelAtReminder: true },
})
```

- Aktuelles Gehalt (`employee-salary-history-repository.ts:32-35`):
```ts
prisma.employeeSalaryHistory.findFirst({
  where: { tenantId, employeeId, validTo: null },
  orderBy: { validFrom: "desc" },
})
```

- Letzte Out-Buchung (`overtime-request-service.ts:170-178`):
```ts
prisma.booking.findFirst({
  where: { tenantId, employeeId, bookingDate: prevDate,
           bookingType: { direction: "out", category: "work" } },
  orderBy: { editedTime: "desc" },
  select: { editedTime: true, bookingDate: true },
})
```

#### 7.7 Pattern-Summary

| Pattern                                  | Count in `src/lib/services/` | Representative               |
|------------------------------------------|------------------------------|------------------------------|
| `prisma.*.groupBy(...)`                  | 11                           | `crm-report-service.ts:76`   |
| `prisma.*.aggregate(...)`                | 4                            | `overtime-payout-repository.ts:134` |
| `include: { _count: { select: {} } }`    | 11                           | `billing-price-list-repository.ts:12` |
| `prisma.$queryRaw`                       | ~30 (16 Files)               | `crm-report-service.ts:107`  |
| Per-Address-Counts für Anfragen/Korr/Tasks | 0                          | —                            |
| `findFirst` + `orderBy desc` (Latest)    | ~10                          | `reminder-level-helper.ts:14`|

---

### 8. Mobile-Optimierung + QR-Scan-Flow

#### 8.1 QR-Scan-Target-URL

**`src/lib/services/service-object-qr-service.ts:93-97`**

Redirect-URL ist hardcoded relativ: `/serviceobjects/${obj.id}` —
**ohne** Locale-Präfix.

Regex: `QR_CODE_REGEX = /^TERP:SO:([a-f0-9]{6}):(.+)$/` (Z. 41).
Capture-Gruppen: (1) erste 6 hex Chars des Tenant-IDs, (2) `number`.
Tenant-Cross-Check in Z. 69.

**`src/trpc/routers/serviceObjects.ts:399-412`** — `scanByQr` ist
`.query` (nicht Mutation) mit Input `{ code: string }`. Output:

```ts
{
  serviceObjectId: string (UUID),
  redirectUrl: string,
  serviceObject: {
    id, number, name, kind, status,
    customerAddress: { id, company, number } | null
  }
}
```

Gate: `serviceObjectProcedure` (requires `crm` module) +
`requirePermission(SO_VIEW)`.

#### 8.2 QR-Scanner-Prefix-Demux

**`src/components/warehouse/qr-scanner.tsx`**

- Prop `allowedPrefixes` (Z. 21-22), Default
  `DEFAULT_PREFIXES = ['TERP:ART:', 'TERP:SO:']` (Z. 24).
- `handleDecode` (Z. 71-89): akzeptiert Scan wenn
  `allowedPrefixes.some((p) => decodedText.startsWith(p))`. Bei
  Match → `onScan(decodedText)` (Z. 84); Raw-Code wird an Parent
  gegeben.
- **Kein eigenes Branching** zwischen `TERP:ART:` und `TERP:SO:` in
  der Scanner-Komponente — Demux liegt beim Caller.

**Caller-Status:** `ScannerTerminal.handleScan`
(`src/components/warehouse/scanner-terminal.tsx:170-186`) ruft
`resolveQrCode.mutateAsync({ code })` → `warehouse.qr.resolveQrCode`
(Article-QR-Resolver, **nicht** `serviceObjects.scanByQr`).

`serviceObjects.scanByQr` ist dedizierte Query, im ScannerTerminal
nicht verdrahtet.

#### 8.3 ServiceObject-Detail-Responsiveness

**`src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx`**

- Einzig verwendeter Breakpoint: `md:` (Z. 103, `md:grid-cols-2`).
  Keine `sm:`, `lg:`, `xl:` Klassen im File.
- Container: **keines**. Page-Root `div.space-y-4.p-6` (Z. 60) —
  volle Breite, feste 24px Padding.
- Bei 375px-Viewport: `grid-cols-1 gap-4 md:grid-cols-2` (Z. 103)
  → Single-Column. Action-Button-Reihe (Z. 77-88) ist `flex gap-2`
  mit 3 Buttons (QrLabelButton, Bearbeiten, Löschen) ohne
  `sm:hidden`/Wrapping-Variante → kann überlaufen/gestaucht werden.
- Touch-Targets: **keine** `h-11`/`h-12`-Klassen. Buttons nutzen
  Default-shadcn-Size.
- **Verdikt: nicht explizit mobile-first.**

#### 8.4 Globales Layout + Viewport

**`src/app/[locale]/(dashboard)/layout.tsx`** — dünne Komposition:
`ProtectedRoute` → `TenantProvider` → `TenantGuard` →
`DemoExpirationGate` → `AppLayout`. **Keine** CSS-Klassen auf Layout.

**`src/components/layout/app-layout.tsx`:**
- `SidebarProvider` + `AppSidebar`
  (shadcn `Sidebar collapsible="icon" variant="inset"`)
- `SidebarInset` (Z. 34): `min-w-0`, **kein** max-width
- Content-Wrapper (Z. 39-46): `p-4 lg:p-6` (+ iOS safe-area-bottom)
- `MobileNav` Bottom-Tab-Bar `lg:hidden` (Z. 51)

**Kein** `max-w-7xl`/`container mx-auto` auf Layout-Ebene.

**Container-Patterns über Pages:**
- Einige Pages: `container mx-auto py-6` (ca. 18 Pages, z. B.
  `orders/documents/[id]/page.tsx:9`, `crm/inquiries/[id]/page.tsx:9`).
- Andere Pages: `space-y-4 p-4|p-6` ohne max-width (serviceobjects
  detail, CRM-address-detail, warehouse-scanner). Volle Breite +
  feste Padding.

#### 8.5 Sidebar / Mobile-Navigation

- **AppSidebar** (`src/components/layout/sidebar/sidebar.tsx:52`):
  shadcn `Sidebar`; bei Mobile wird Overlay-Sheet über `SidebarTrigger`
  getriggert. `isMobile` aus `useSidebar()` (Z. 44) nur für User-Dropdown-
  Side (`side={isMobile ? 'bottom' : 'right'}`, Z. 115).
- **MobileNav** (`src/components/layout/mobile-nav.tsx`):
  `fixed inset-x-0 bottom-0 z-40 … lg:hidden` (Z. 26-30). 4 primary
  Nav-Items + „More"-Button, der via `setOpenMobile(true)` shadcn-
  Sidebar-Sheet öffnet. Height:
  `h-[calc(var(--bottom-nav-height)+var(--safe-area-bottom))]`.
- **MobileSidebarSheet** (`src/components/layout/mobile-sidebar-sheet.tsx`):
  separate Slide-in-from-left, `w-[280px]` (Z. 38).

#### 8.6 Mobile-Hooks — zwei parallele Varianten

1. **`src/hooks/use-mobile.ts`** — `useIsMobile()`, Breakpoint
   `MOBILE_BREAKPOINT = 1024` (Z. 3).
2. **`src/hooks/use-media-query.ts`** — `useMediaQuery(query)` +
   zweites `useIsMobile` mit Breakpoint `(max-width: 767px)` (Z. 27).

Beide Hooks liefern `false` während SSR.

#### 8.7 Withdrawal-Terminal — Mobile-First-Vorbild

**`src/components/warehouse/withdrawal-terminal.tsx`** — explizit
für Lager-Tablet/Mobile entworfen.

- Root: `space-y-4 sm:space-y-6` (Z. 241).
- Step-Indicator: `overflow-x-auto pb-1` (Z. 243); Items
  `px-3 sm:px-4`, `gap-1.5 sm:gap-2`, `text-xs sm:text-sm` (Z. 262).
- Reference-Type-Grid: `grid-cols-1 sm:grid-cols-2` (Z. 293).
- Reference-Input: `w-full sm:max-w-md font-mono text-base sm:text-sm`
  (Z. 381).
- Article-List dual-rendered:
  - Mobile: `divide-y rounded-lg border sm:hidden` (Z. 449) —
    Card-Layout, `inputMode="numeric"` (Z. 464), `h-10`-Qty-Inputs
    (Z. 468), `h-10 w-10`-Delete-Buttons (Z. 475).
  - Desktop: `hidden sm:block` Table (Z. 490).
- Next-Button: `min-h-[44px] sm:min-h-0 w-full sm:w-auto` (Z. 406).
- Confirm-Button Step 3: `min-h-[48px] sm:min-h-0 text-base sm:text-sm`
  (Z. 625).

#### 8.8 Scanner-Terminal

**`src/components/warehouse/scanner-terminal.tsx`** —
`mx-auto max-w-lg space-y-4` (Z. 320) — 512px max, zentriert.
Quantity-Inputs: `h-14 text-2xl text-center` (Z. 487, 533, 682).
Confirm-Buttons: `h-14 w-full text-lg` (Z. 494, 564, 689).
Reference-Type-Buttons `h-12` (Z. 549, `grid-cols-3 gap-2`).

Scanner-Page-Wrapper (`warehouse/scanner/page.tsx:20`):
`space-y-4 p-4 md:p-6`.

#### 8.9 Stärkste existierende Mobile-First-Detail-Pages

1. **CRM-Address-Detail** —
   `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`:
   - `sm:hidden`-Quick-Action-Sektion (Z. 175-205) mit
     `min-h-[44px]`-Tap-Targets für tel/email/maps.
   - `sm:hidden`-Mobile-Action-Strip (Z. 208-229) mit
     `min-h-[44px] flex-1`.
   - `hidden sm:flex`-Desktop-Variante (Z. 232-253).
   - Content-Grid: `grid-cols-1 md:grid-cols-2` (Z. 271).
   - Heading: `text-xl sm:text-2xl` (Z. 160).
2. **Withdrawal-Terminal** (s. o. 8.7).
3. **Scanner-Terminal** (s. o. 8.8).

#### 8.10 Auth-Gate für `/serviceobjects/[id]`

`src/app/[locale]/(dashboard)/layout.tsx:21` wraps alle Routes unter
`(dashboard)` in `ProtectedRoute`. Komponente
`src/components/auth/protected-route.tsx:48-61` prüft
`isAuthenticated` via `useEffect`, redirectet zu
`/login?returnUrl=<current-path>` bei Fehlschlag. Clientseitig.

Zusätzlich: tRPC `scanByQr` + alle serviceObjects-Procedures
benötigen valide Tenant-Session via `tenantProcedure` + `crm`-Modul-
Guard.

---

## Code References

### ServiceObject (T-1 Stand)

- `src/app/[locale]/(dashboard)/serviceobjects/page.tsx` — Liste
- `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:91-96` — Tab-Definition (3 Tabs)
- `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:103` — `md:grid-cols-2`
- `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:277-284` — ConfirmDialog (erwähnt Orders/Bewegungen ohne Rendering)
- `src/lib/services/service-object-repository.ts:85` — `_count` include (children, attachments)
- `src/lib/services/service-object-repository.ts:122-128` — `_count` in `findById` (children, attachments, orders, stockMovements)
- `src/lib/services/service-object-repository.ts:185-203` — `countLinkedOrders`, `countLinkedStockMovements`
- `src/lib/services/service-object-service.ts:734-740` — Counts für Soft/Hard-Delete
- `src/lib/services/service-object-qr-service.ts:41` — `QR_CODE_REGEX`
- `src/lib/services/service-object-qr-service.ts:93-97` — `redirectUrl: /serviceobjects/${id}`
- `src/trpc/routers/serviceObjects.ts:399-412` — `scanByQr` Query
- `src/hooks/use-service-objects.ts` — 16 Hooks
- `src/components/serviceobjects/` — 7 Komponenten

### Order

- `prisma/schema.prisma:2467-2503` — Order-Model
- `prisma/schema.prisma:2482` — `serviceObjectId` FK
- `prisma/schema.prisma:2514-2537` — `OrderAssignment`
- `prisma/schema.prisma:5239-5268` — `OrderBooking`
- `src/trpc/routers/orders.ts:144` — `list`-Input (isActive, status, KEIN serviceObjectId)
- `src/trpc/routers/orders.ts:38-54` — `orderOutputSchema` (KEIN serviceObjectId)
- `src/trpc/routers/orders.ts:91-128` — `mapOrderToOutput`
- `src/lib/services/order-repository.ts:10-14` — `orderInclude` (costCenter only)
- `src/lib/services/order-repository.ts:21-34` — `findMany` (KEIN ServiceObject-Filter)
- `src/lib/services/order-service.ts:15-19` — `TRACKED_FIELDS` (Audit)
- `src/app/[locale]/(dashboard)/admin/orders/page.tsx:57` — `useOrders` (keine Filter)
- `src/app/[locale]/(dashboard)/admin/orders/page.tsx:77-86` — Client-seitige Customer-Filterung
- `src/components/orders/order-data-table.tsx:72-79` — Spalten
- `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx:88-91` — `useOrderBookings`
- `src/hooks/use-order-bookings.ts:23` — Hook-Definition

### WhStockMovement

- `prisma/schema.prisma:5404-5413` — `WhStockMovementType` Enum
- `prisma/schema.prisma:5515-5551` — `WhStockMovement` Model
- `prisma/schema.prisma:5531` — `serviceObjectId` Spalte
- `prisma/schema.prisma:5542` — `serviceObject` Relation
- `prisma/schema.prisma:5549` — `@@index([tenantId, serviceObjectId])`
- `src/lib/services/wh-withdrawal-service.ts:373-431` — `listWithdrawals` (mit `serviceObjectId`-Filter)
- `src/lib/services/wh-withdrawal-service.ts:404` — Filter-Zeile
- `src/lib/services/wh-withdrawal-service.ts:433` — `listByOrder`
- `src/lib/services/wh-withdrawal-service.ts:449` — `listByDocument`
- `src/lib/services/wh-withdrawal-service.ts:133, 232, 334` — `createdById` writes
- `src/lib/services/wh-stock-movement-repository.ts:7-60` — `findMany` (KEIN serviceObjectId)
- `src/lib/services/wh-stock-movement-repository.ts:62-78` — `findByArticle`
- `src/trpc/routers/warehouse/withdrawals.ts:21` — whProcedure
- `src/trpc/routers/warehouse/withdrawals.ts:43, 73, 133` — serviceObjectId-Inputs
- `src/trpc/routers/warehouse/stockMovements.ts:168-180` — `listByArticle`
- `src/components/warehouse/article-movements-tab.tsx:14-28` — `typeVariants`/`typeKeys`
- `src/components/warehouse/article-movements-tab.tsx:86-94` — Spalten
- `src/components/warehouse/withdrawal-terminal.tsx:35, 85-90, 49, 103, 130-131, 346-388, 190-193, 229-235` — SO-Integration
- `src/components/warehouse/withdrawal-history.tsx:37-65` — `ReferenceDisplay` (kein SO-Branch)
- `src/components/warehouse/withdrawal-history.tsx:76-81` — `useWhWithdrawals` ohne SO-Filter
- `src/components/warehouse/qr-scanner.tsx:21-24` — `allowedPrefixes` mit Defaults
- `src/components/warehouse/qr-scanner.tsx:71-89` — `handleDecode`
- `src/components/warehouse/scanner-terminal.tsx:170-186` — `handleScan`
- `src/hooks/use-wh-withdrawals.ts:6-33` — Hook ohne SO-Option

### CRM

- `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx:52` — `useCrmAddress`
- `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx:257-267` — 8-Tab-Definition
- `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx:175-253` — `sm:hidden`/`hidden sm:flex` Action-Strips
- `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx:271` — `grid-cols-1 md:grid-cols-2`
- `src/hooks/use-crm-addresses.ts:32-40` — `useCrmAddress`
- `src/lib/services/crm-address-service.ts:544-562` — `getGroupStats` (billing aggregate)
- `src/lib/services/crm-address-repository.ts:51-53` — `_count: { childAddresses }`
- `src/lib/services/crm-address-repository.ts:300-308` — select + `_count` Variante
- `messages/de.json:5655-5662` — 8 Tab-Labels

### Dashboard

- `src/app/[locale]/page.tsx:13-21` — Redirect-Gate
- `src/app/[locale]/(dashboard)/dashboard/page.tsx:35-80` — Dashboard-Struktur
- `src/components/dashboard/stats-card.tsx:9-20` — `StatsCardProps`
- `src/components/dashboard/stats-card.tsx:73-101` — Render
- `src/components/dashboard/stats-card.tsx:107-120` — Skeleton
- `src/components/dashboard/index.ts:7-8` — Barrel-Export
- `src/components/warehouse/corrections/wh-correction-dashboard.tsx:38-61` — StatsCard-Verwendung
- `src/components/warehouse/dashboard/stock-value-card.tsx:17-27` — Wrapper-Pattern
- `src/components/warehouse/dashboard/open-orders-card.tsx:19-33` — Multi-Query-Aggregation
- `src/components/team-overview/team-stats-cards.tsx:138-274` — Inline-KPI-Tiles (ohne StatsCard)

### Layout + Mobile

- `src/app/[locale]/(dashboard)/layout.tsx:21` — `ProtectedRoute`-Wrapper
- `src/components/auth/protected-route.tsx:48-61` — Auth-Check-Logik
- `src/components/layout/app-layout.tsx:38-47` — Content-Wrapper
- `src/components/layout/mobile-nav.tsx:26-30` — Bottom-Nav
- `src/components/layout/mobile-sidebar-sheet.tsx:38` — Sheet-Width
- `src/hooks/use-mobile.ts` — `useIsMobile()` 1024px
- `src/hooks/use-media-query.ts:27` — `useIsMobile()` 768px

### Aggregate-Pattern-Beispiele

- `src/lib/services/crm-report-service.ts:76-94` — groupBy Typ
- `src/lib/services/crm-report-service.ts:107-147` — $queryRaw date_trunc
- `src/lib/services/crm-report-service.ts:199-205` — groupBy top-N
- `src/lib/services/payroll-export-repository.ts:200-209` — groupBy multi-field _sum
- `src/lib/services/overtime-payout-repository.ts:134-138` — aggregate _sum
- `src/lib/services/crm-address-service.ts:544-562` — aggregate _sum parallel
- `src/lib/services/wh-reservation-repository.ts:69-73` — aggregate _sum
- `src/lib/services/billing-price-list-repository.ts:11-13` — _count const
- `src/lib/services/crm-address-repository.ts:51-53` — _count list
- `src/lib/services/reminder-level-helper.ts:14-22` — findFirst-latest
- `src/lib/services/employee-salary-history-repository.ts:32-35` — findFirst-current
- `src/lib/services/probation-repository.ts:233-251` — $queryRaw COUNT + IDs

## Architecture Documentation

Die von T-1 eingeführten Relationen und Indices sind vorhanden und
einsatzbereit:

- `Order.serviceObjectId` (nullable FK, indiziert).
- `WhStockMovement.serviceObjectId` (nullable FK, indiziert).
- `ServiceObject.orders` + `ServiceObject.stockMovements` (reverse
  Relations, für `_count` und `include` nutzbar).

Die Service-Layer-Nutzung ist **asymmetrisch**:
- **Warehouse**-Seite: `listWithdrawals` akzeptiert `serviceObjectId`-
  Filter; `createWithdrawal`/`createBatchWithdrawal` propagieren das
  Feld via Procedure-Input. `cancelWithdrawal` (laut T-1-Plan)
  kopiert das Feld ins Reversal-Insert.
- **Orders**-Seite: Router propagiert `serviceObjectId` weder im
  Input-Filter noch im Output-Schema — Feld existiert physisch, ist
  aber router-mäßig unsichtbar.

Router-Pattern für neue Procedures: `tenantProcedure` +
`requirePermission(...)` + module-Guard (`serviceObjectProcedure`
existiert in `src/trpc/routers/serviceObjects.ts` über
`requireModule('crm')`).

Detail-Page-Muster: shadcn `Tabs` mit `defaultValue`; CRM-Address-
Detail ist Vorbild für 8-Tabs-Layout mit mehrfach hook-gefeedeten
Tab-Inhalten. Mobile-first-Vorbilder (Withdrawal-Terminal,
Scanner-Terminal, CRM-Address-Detail) nutzen konsistent
`sm:`/`md:`/`lg:` mit `min-h-[44px]`- und `min-h-[48px]`-Touch-
Targets, `inputMode="numeric"`, `text-base sm:text-sm`-Responsive-
Fonts.

Aggregate-Pattern-Präferenz in Terp:
1. Für per-Entity-Counts: `_count` im Include (billig, einzige
   Query).
2. Für gruppierte Aggregationen: `groupBy` mit `_count`/`_sum`.
3. Für Single-Field-Sums: `aggregate` mit `_sum`.
4. Für komplexe SQL (date_trunc, Multi-Joins, Raw-Count+IDs):
   `$queryRaw` mit tagged-template `Prisma.sql`.
5. Für „neuester Record": `findFirst` + `orderBy desc` +
   optional `select`.

„Letzte Aktivität"-Konzept ist im Codebase **nirgends**
persistiert — weder als Feld auf Entities noch als denormalisiertes
Cache-Feld. Muster für derartige Logik existiert über Ad-hoc-
`findFirst`-Calls, aber nicht als wiederverwendbares Modul.

## Historical Context (from thoughts/)

- `thoughts/shared/plans/2026-04-21-serviceobjekte-stammdaten.md` —
  T-1-Plan (Stammdaten, Baum, Anhänge, QR, Import, Withdrawal-
  Parallel-Pfad). Referenz für Hard-Rules (Kein `@relation` zwischen
  Platform und ServiceObject; `Order.customer`-Freitext bleibt
  unangetastet; `WhStockMovement.machineId` bleibt unangetastet).
- `thoughts/shared/research/2026-04-20-serviceobjekte-codebase-analyse.md` —
  Pre-T-1-Research (IST-Zustand VOR T-1). Relevant für Kontrast:
  damals gab es keinen `ServiceObject`, kein `Order.serviceObjectId`.
  Erste Dokumentation der Adjacency-List-Hierarchien, Attachment-
  Patterns, QR-Muster.

## Related Research

- `thoughts/shared/research/2026-04-20-serviceobjekte-codebase-analyse.md`
  — Initialer Codebase-Stand VOR T-1-Merge.

## Open Questions

Keine — die Fragestellungen des Research-Auftrags wurden
vollständig abgedeckt. Alle acht Bereiche sind mit Datei/Zeile +
Query-Shape + UI-Stand dokumentiert, ausreichend für einen direkten
`/create_plan`-Run ohne Rückfragen.
