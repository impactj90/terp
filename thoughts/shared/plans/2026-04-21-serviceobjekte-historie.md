---
date: 2026-04-21
planner: impactj90
git_commit: 08c0d142
branch: staging
ticket: T-2 (Serviceobjekte — Einsatz-Historie auf der Detailseite)
status: ready-for-implementation
last_updated: 2026-04-21
last_updated_by: impactj90
---

# Serviceobjekte — Einsatz-Historie auf der Detailseite (T-2) — Implementation Plan

## Overview

Macht die in T-1 persistierten Foreign-Keys `Order.serviceObjectId` und
`WhStockMovement.serviceObjectId` für den Techniker am Bildschirm
sichtbar. Ein neuer Tab „Historie" auf der Serviceobjekt-Detailseite
zeigt alle verknüpften Aufträge (mit Summen an gebuchten Minuten und
Technikern) und alle Materialentnahmen (mit ausführendem Benutzer).
Ein Widget „Letzte Wartung" oben im Übersicht-Tab zeigt den jüngsten
Einsatz auf einen Blick. CRM-Adress-Detail erhält einen 9. Tab
„Serviceobjekte", sodass das Büro vom Kunden zum Objekt navigieren kann.
Warehouse-Views lernen gleichzeitig die ServiceObject-Referenz und
den ausführenden Benutzer zu rendern.

Primärer Anwendungsfall: Techniker scannt QR am Serviceobjekt →
sofort sichtbar „Letzter Einsatz am 12.02.2026 von Hans Müller, 3,5h"
+ letzte Ersatzteile → keine Rückfrage ins Büro.

Keine neuen DB-Spalten, keine neuen Entitäten, keine Migration. Reine
Aggregations-/Rendering-Arbeit auf vorhandenen T-1-Daten + drei
T-1-Restarbeiten (Router-Output, List-Filter, Warehouse-UI).

## Current State Analysis

Research-Grundlage: `thoughts/shared/research/2026-04-21-serviceobjekte-historie-codebase-analyse.md`.
Alle im Ticket referenzierten IST-Befunde wurden erneut gegen den
Codebase-Stand auf `staging@08c0d142` verifiziert.

**Daten-Layer (fertig):**
- `Order.serviceObjectId` (FK + Index) existiert seit T-1
  (`prisma/schema.prisma:2482`, `@@index([tenantId, serviceObjectId])`).
- `WhStockMovement.serviceObjectId` (FK + Index) existiert seit T-1
  (`prisma/schema.prisma:5531`, `@@index([tenantId, serviceObjectId])`).
- Prisma-Relationen `ServiceObject.orders` und `ServiceObject.stockMovements`
  sind nutzbar.
- `service-object-repository.ts:122-128` lädt bereits
  `_count: { orders, stockMovements }` in `findById` — UI rendert das nicht.

**Router-Layer (asymmetrisch offen):**
- `src/trpc/routers/orders.ts:38-54` — `orderOutputSchema` enthält
  **kein** `serviceObjectId`-Feld.
- `src/trpc/routers/orders.ts:91-128` — `mapOrderToOutput` propagiert
  das Feld nicht.
- `src/trpc/routers/orders.ts:144-151` — `list`-Input akzeptiert nur
  `isActive` + `status`, **kein** `serviceObjectId`-Filter.
- `src/lib/services/order-repository.ts:16-35` — `findMany` kennt
  `serviceObjectId` **nicht** als Filter.
- `src/trpc/routers/warehouse/withdrawals.ts:152-180` — hat
  `listByOrder` und `listByDocument`, **keine** `listByServiceObject`-
  Procedure.
- `src/lib/services/wh-withdrawal-service.ts:373-431` — `listWithdrawals`
  akzeptiert `serviceObjectId`-Filter; **aber** keine dedizierte
  `listByServiceObject`-Funktion analog zu `listByOrder` (Z. 433).
- `src/lib/services/order-booking-service.ts` + `-repository.ts` —
  **kein** Aggregator (`groupBy`/`_sum`) vorhanden.

**Service-Layer (teilweise vorhanden):**
- `service-object-service.ts` — List/get/create/update/move/delete,
  aber **keine** `getHistoryByServiceObject`.
- Kein `user-display-name-service.ts` (WhStockMovement.createdById
  und OrderBooking.employeeId sind UUID-only, UI rendert nichts).

**UI-Layer (nicht vorhanden):**
- `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:91-96` —
  3 Tabs (Übersicht, Hierarchie, Anhänge), **kein** Historie-Tab.
  `Tabs` läuft uncontrolled via `defaultValue="overview"`.
- `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx:257-267` —
  8 Tabs, **kein** Serviceobjekte-Tab.
- `src/components/warehouse/withdrawal-history.tsx:37-65` —
  `ReferenceDisplay` hat Branches für `orderId`, `documentId`,
  `machineId` — **kein** `serviceObjectId`-Branch. `createdById` wird
  nicht gerendert.
- `src/components/warehouse/article-movements-tab.tsx:87-93` —
  Spalten Datum/Typ/Menge/Vorher/Nachher/Ref/Grund — **keine**
  User-Spalte.
- i18n-Keys `colCreatedBy` (`de.json:6451`) und `colUser`
  (`de.json:6503`) existieren, werden aber nirgends verwendet.
- `src/hooks/use-service-objects.ts` hat 16 Hooks, **kein** History-Hook.
- `src/hooks/use-wh-withdrawals.ts` hat `useWhWithdrawalsByOrder` und
  `useWhWithdrawalsByDocument`, **kein** `...ByServiceObject`.

**Pattern-Vorbilder (zu befolgen):**
- GroupBy-Aggregation mit `_sum`:
  `src/lib/services/payroll-export-repository.ts:200-209`.
- „Latest-Record": `findFirst` + `orderBy desc`
  (`src/lib/services/reminder-level-helper.ts:14-22`).
- Test-Mock-Style: `src/lib/services/__tests__/crm-report-service.test.ts:1-32`
  (`createMockPrisma` mit `vi.fn().mockResolvedValue(...)`).
- Integrations-Test mit echtem DB: `overtime-payout-service.integration.test.ts`
  (HAS_DB-Guard, cleanup in beforeAll/afterAll).
- E2E-Service-Objects: `src/e2e-browser/81-service-objects.spec.ts` —
  Helpers unter `helpers/service-object-fixtures.ts` (resetServiceObjects,
  ensureSeedCustomer).

## Desired End State

**Nach erfolgreichem Merge:**

1. Techniker öffnet `/serviceobjects/[id]` → sieht im Übersicht-Tab
   oben eine „Letzte Wartung"-Karte mit Datum, Techniker, Stunden.
2. Wechselt zu Tab „Historie" → sieht Sektion „Einsätze" (Orders
   mit zugewiesenen Mitarbeitern + Summen aus OrderBookings) und
   Sektion „Materialentnahmen" (Stock-Movements mit ausführendem
   Benutzer und Artikel).
3. Öffnet `/crm/addresses/[id]` → sieht 9. Tab „Serviceobjekte" mit
   Baum der am Kunden hängenden Serviceobjekte.
4. Öffnet Warehouse-Withdrawal-History → Referenz-Spalte rendert
   Serviceobjekt-basierte Withdrawals korrekt (nicht mehr `—`);
   neue User-Spalte zeigt „Hans Müller" statt einer UUID.
5. Öffnet Artikel-Detail → Movements-Tab bekommt neue User-Spalte.

**Verifikation via:**
- Unit-Tests auf `order-booking-aggregator` + `user-display-name-service`
  + `service-object-service.getHistoryByServiceObject` +
  `wh-withdrawal-service.listByServiceObject`.
- tRPC-Integration-Tests (existierende Muster) oder Router-Compile-Checks.
- E2E-Browser-Test `82-service-object-history.spec.ts` — legt 2 Orders
  + 3 Bookings + 2 Withdrawals an und verifiziert sichtbare Zahlen
  auf Detailseite + CRM-Adress-Tab.
- `pnpm typecheck` darf nicht mehr Fehler melden als der bestehende
  Baseline-Stand (~1463).

### Key Discoveries
- `prisma.orderBooking.groupBy` mit `by: ['orderId']`, `_sum: { timeMinutes }`,
  `_count: true`, `_max: { bookingDate }` liefert alle drei benötigten
  Summen in einem Call (Vorbild:
  `src/lib/services/payroll-export-repository.ts:200-209`).
- `Order.serviceObjectId` ist ein Scalar-Feld; ein `findMany` liefert
  es ohne expliziten `include` automatisch durch.
- `OrderAssignment.employee` (`prisma/schema.prisma:2514-2537`) ist
  cascade-FK auf `Employee` — selektiert werden `firstName`,
  `lastName`, `personnelNumber` (Vorbild:
  `order-assignment-repository.ts:13-20`).
- `WhStockMovement.createdById` ist UUID-only (kein `@relation`) — wir
  resolven via separatem `prisma.user.findMany({ where: { id: { in } } })`.
- `Tabs` (shadcn) ohne `value` läuft uncontrolled. Link „Zur Historie"
  aus der `LastServiceCard` erfordert kontrollierte Tabs — siehe
  Deviation Notes.

## What We're NOT Doing

- **Keine** neuen Entitäten (kein `MaintenanceEvent`, `FailureRecord`,
  `MeterReading`, `MaintenanceSchedule`). Befund-Erfassung kommt in T-3/T-4.
- **Keine** neuen DB-Spalten, **keine** Migration, **keine**
  `@relation`-Änderungen.
- **Keine** Denormalisierung („letzte Aktivität"-Cache-Feld auf
  `ServiceObject`). On-Demand-Query ist performant genug für
  <1000 Orders pro SO.
- **Keine** Änderung am `Order.customer`-Freitextfeld (T-1-Regel bleibt).
- **Keine** Änderung an `WhStockMovement.machineId` (T-1-Regel bleibt).
- **Keine** Änderung am QR-Scanner-Flow (`serviceObjects.scanByQr`
  bleibt wie ist).
- **Keine** Platform↔ServiceObject-`@relation`-Deklarationen.
- **Keine** Migration der bestehenden 3 hardcoded Tab-Labels auf next-intl
  (nur die neuen Historie-Keys sind i18n-gepflegt — das bleibt
  bewusst heterogen, da die T-1-Detailseite konsequent hardcoded ist).
- **Keine** neue Dashboard-Widget („Serviceobjekte heute gewartet").
- **Keine** mobile-first-Umstellung der Detailseite (bleibt `md:`-only,
  eigener Scope).
- **Keine** neuen Permissions — bestehende `service_objects.view` +
  `wh_stock.view` reichen.
- **Keine** Änderung an T-1-Modellen (`ServiceObject`, `ServiceObjectAttachment`).

## Data Model

**Keine Änderungen.** Alle FK-Spalten und Indices liegen seit T-1
in `prisma/schema.prisma`. Migration-Block ist absichtlich leer.

**Genutzte Include-Variante (neu, nur in der Repository-Schicht):**

```ts
// order-repository.ts — neue Funktion findManyByServiceObject
include: {
  assignments: {
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, personnelNumber: true },
      },
    },
  },
}
```

```ts
// wh-withdrawal-service.ts — neue Funktion listByServiceObject
include: {
  article: {
    select: { id: true, number: true, name: true, unit: true },
  },
}
// (createdById bleibt als Scalar-Spalte im Output — User-Auflösung
// macht der Caller via userDisplayNameService)
```

Der allgemeine `orderInclude` (`order-repository.ts:10-14`) bleibt
unverändert — Assignments-Include gilt ausschließlich für den neuen
History-Pfad, nicht für `orders.list`.

## Service Layer

### Neu: `src/lib/services/order-booking-aggregator.ts`

Kanonische Signatur `(prisma, tenantId, …)`.

```ts
export type OrderBookingSummary = {
  orderId: string
  totalMinutes: number
  bookingCount: number
  lastBookingDate: Date | null
}

export async function getBookingSummaryByOrder(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
): Promise<OrderBookingSummary> {
  const [grouped] = await prisma.orderBooking.groupBy({
    by: ["orderId"],
    where: { tenantId, orderId },
    _sum: { timeMinutes: true },
    _count: true,
    _max: { bookingDate: true },
  })
  return {
    orderId,
    totalMinutes: grouped?._sum.timeMinutes ?? 0,
    bookingCount: grouped?._count ?? 0,
    lastBookingDate: grouped?._max.bookingDate ?? null,
  }
}

export async function getBookingSummariesByOrders(
  prisma: PrismaClient,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, OrderBookingSummary>> {
  if (orderIds.length === 0) return new Map()
  const rows = await prisma.orderBooking.groupBy({
    by: ["orderId"],
    where: { tenantId, orderId: { in: orderIds } },
    _sum: { timeMinutes: true },
    _count: true,
    _max: { bookingDate: true },
  })
  const map = new Map<string, OrderBookingSummary>()
  for (const row of rows) {
    map.set(row.orderId, {
      orderId: row.orderId,
      totalMinutes: row._sum.timeMinutes ?? 0,
      bookingCount: row._count,
      lastBookingDate: row._max.bookingDate ?? null,
    })
  }
  // Orders ohne Bookings kommen nicht aus groupBy — Default ergänzen
  for (const id of orderIds) {
    if (!map.has(id)) {
      map.set(id, { orderId: id, totalMinutes: 0, bookingCount: 0, lastBookingDate: null })
    }
  }
  return map
}
```

**Hard-Rule-Abdeckung:** `where: { tenantId, ... }` garantiert Tenant-Scoping.
Empty-Array-Short-Circuit garantiert kein Pan-Tenant-Leak über leere
`in`-Listen.

### Neu: `src/lib/services/user-display-name-service.ts`

```ts
export type UserDisplay = {
  userId: string
  firstName: string | null
  lastName: string | null
  email: string
  displayName: string
}

function buildDisplayName(u: { firstName: string | null; lastName: string | null; email: string }): string {
  const first = (u.firstName ?? "").trim()
  const last = (u.lastName ?? "").trim()
  if (first || last) return `${first} ${last}`.trim()
  return u.email || "Unbekannt"
}

export async function resolveMany(
  prisma: PrismaClient,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, UserDisplay>> {
  const ids = Array.from(new Set(userIds.filter((x) => !!x)))
  if (ids.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  const map = new Map<string, UserDisplay>()
  for (const u of users) {
    map.set(u.id, {
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      displayName: buildDisplayName(u),
    })
  }
  return map
}
```

**Notiz zur Tenant-Scope-Strenge:** `where: { id: { in: ids }, tenantId }`
stellt sicher, dass cross-tenant UUIDs stillschweigend als "Unbekannt"
zurückgegeben werden (Map enthält sie nicht). Aufrufer fallbackt
`displayName = "Unbekannt"` für unbekannte IDs.

### Erweitert: `src/lib/services/order-repository.ts`

Zwei kleine Änderungen:

```ts
// 1. findMany-Params um serviceObjectId erweitern (kein Include-Change)
export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean; status?: string; serviceObjectId?: string }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params?.isActive !== undefined) where.isActive = params.isActive
  if (params?.status !== undefined) where.status = params.status
  if (params?.serviceObjectId !== undefined) where.serviceObjectId = params.serviceObjectId

  return prisma.order.findMany({
    where,
    orderBy: { code: "asc" },
    include: orderInclude,
  })
}

// 2. Neue Funktion für History-Pfad mit Assignments-Include
export async function findManyByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  limit: number
) {
  return prisma.order.findMany({
    where: { tenantId, serviceObjectId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      costCenter: { select: { id: true, code: true, name: true } },
      assignments: {
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, personnelNumber: true },
          },
        },
      },
    },
  })
}
```

### Erweitert: `src/lib/services/wh-withdrawal-service.ts`

Neue Funktion analog zu `listByOrder` (Z. 433):

```ts
export async function listByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  params?: { limit?: number }
) {
  return prisma.whStockMovement.findMany({
    where: {
      tenantId,
      type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] },
      serviceObjectId,
    },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
    },
    orderBy: { date: "desc" },
    take: params?.limit ?? 50,
  })
}
```

### Erweitert: `src/lib/services/service-object-service.ts`

Neue Funktion `getHistoryByServiceObject`:

```ts
export type OrderHistoryItem = {
  id: string
  code: string
  name: string
  status: string
  validFrom: Date | null
  validTo: Date | null
  createdAt: Date
  assignedEmployees: Array<{
    id: string
    firstName: string
    lastName: string
    personnelNumber: string | null
  }>
  summary: {
    totalMinutes: number
    bookingCount: number
    lastBookingDate: Date | null
  }
}

export type StockMovementHistoryItem = {
  id: string
  articleNumber: string
  articleName: string
  type: "WITHDRAWAL" | "RETURN" | "DELIVERY_NOTE"
  quantity: number
  date: Date
  createdBy: { userId: string; displayName: string } | null
  reason: string | null
  notes: string | null
}

export type ServiceObjectHistoryResult = {
  orders: OrderHistoryItem[]
  stockMovements: StockMovementHistoryItem[]
  totals: { orderCount: number; totalMinutes: number; movementCount: number }
}

export async function getHistoryByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  params?: { limit?: number }
): Promise<ServiceObjectHistoryResult> {
  const limit = params?.limit ?? 50

  // 1. Existence + tenant scope via getServiceObjectById (throws if missing)
  await getServiceObjectById(prisma, tenantId, serviceObjectId)

  // 2. Parallele Queries für Orders + Movements
  const [orders, movements] = await Promise.all([
    orderRepo.findManyByServiceObject(prisma, tenantId, serviceObjectId, limit),
    whWithdrawalService.listByServiceObject(prisma, tenantId, serviceObjectId, { limit }),
  ])

  // 3. Aggregate: Booking-Summen + User-Namen in einer zweiten Parallel-Welle
  const orderIds = orders.map((o) => o.id)
  const createdByIds = movements
    .map((m) => m.createdById)
    .filter((id): id is string => id !== null)

  const [summaryMap, userMap] = await Promise.all([
    orderBookingAggregator.getBookingSummariesByOrders(prisma, tenantId, orderIds),
    userDisplayNameService.resolveMany(prisma, tenantId, createdByIds),
  ])

  // 4. Mapping auf Output-Shapes
  const orderItems: OrderHistoryItem[] = orders.map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    status: o.status,
    validFrom: o.validFrom,
    validTo: o.validTo,
    createdAt: o.createdAt,
    assignedEmployees: (o.assignments ?? []).map((a) => ({
      id: a.employee.id,
      firstName: a.employee.firstName,
      lastName: a.employee.lastName,
      personnelNumber: a.employee.personnelNumber,
    })),
    summary: summaryMap.get(o.id) ?? {
      totalMinutes: 0,
      bookingCount: 0,
      lastBookingDate: null,
    },
  }))

  const movementItems: StockMovementHistoryItem[] = movements.map((m) => ({
    id: m.id,
    articleNumber: m.article.number,
    articleName: m.article.name,
    type: m.type as "WITHDRAWAL" | "RETURN" | "DELIVERY_NOTE",
    quantity: m.quantity,
    date: m.date,
    createdBy: m.createdById
      ? {
          userId: m.createdById,
          displayName: userMap.get(m.createdById)?.displayName ?? "Unbekannt",
        }
      : null,
    reason: m.reason,
    notes: m.notes,
  }))

  const totalMinutes = orderItems.reduce((sum, o) => sum + o.summary.totalMinutes, 0)
  return {
    orders: orderItems,
    stockMovements: movementItems,
    totals: {
      orderCount: orderItems.length,
      totalMinutes,
      movementCount: movementItems.length,
    },
  }
}
```

**Tenant-Scope:** Alle vier Unter-Calls (`getServiceObjectById`,
`findManyByServiceObject`, `listByServiceObject`, `resolveMany`) prüfen
`tenantId` in der `where`-Klausel. `getBookingSummariesByOrders` prüft
zusätzlich `tenantId` — auch wenn die `orderIds` bereits Tenant-gescoped
sind, verhindert das jede Drift.

## tRPC Layer

### Erweitert: `src/trpc/routers/orders.ts`

Drei Änderungen (T-1-Restarbeit):

```ts
// 1. OrderOutput-Schema (Z. 38-54) — neues Feld
const orderOutputSchema = z.object({
  ...,
  serviceObjectId: z.string().uuid().nullable(),
  ...
})

// 2. list-Input (Z. 144-151) — neuer Filter
.input(
  z
    .object({
      isActive: z.boolean().optional(),
      status: z.string().max(50).optional(),
      serviceObjectId: z.string().uuid().optional(),
    })
    .optional()
)

// 3. mapOrderToOutput (Z. 91-128) — Feld propagieren
function mapOrderToOutput(o: { ...; serviceObjectId: string | null; ... }): OrderOutput {
  return { ..., serviceObjectId: o.serviceObjectId, ... }
}
```

### Neu: Procedure in `src/trpc/routers/serviceObjects.ts`

```ts
getHistory: serviceObjectProcedure
  .use(requirePermission(SO_VIEW))
  .input(
    z.object({
      id: z.string().uuid(),
      limit: z.number().int().min(1).max(200).default(50),
    })
  )
  .query(async ({ ctx, input }) => {
    try {
      return await serviceObjectService.getHistoryByServiceObject(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input.id,
        { limit: input.limit }
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

Gate: `serviceObjectProcedure` (tenant + crm-Modul) +
`requirePermission(SO_VIEW)`. **Keine neuen Permissions.**

### Neu: Procedure in `src/trpc/routers/warehouse/withdrawals.ts`

```ts
listByServiceObject: whProcedure
  .use(requirePermission(WH_STOCK_VIEW))
  .input(
    z.object({
      serviceObjectId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).default(50),
    })
  )
  .query(async ({ ctx, input }) => {
    try {
      return await withdrawalService.listByServiceObject(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input.serviceObjectId,
        { limit: input.limit }
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

## UI Layer

### Neue Hooks

`src/hooks/use-service-objects.ts` (erweitern):

```ts
export function useServiceObjectHistory(
  id: string,
  params?: { limit?: number },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.serviceObjects.getHistory.queryOptions(
      { id, limit: params?.limit ?? 50 },
      { enabled: enabled && !!id }
    )
  )
}
```

`src/hooks/use-wh-withdrawals.ts` (erweitern):

```ts
export function useWhWithdrawalsByServiceObject(
  serviceObjectId: string,
  params?: { limit?: number },
  enabled = true
) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.withdrawals.listByServiceObject.queryOptions(
      { serviceObjectId, limit: params?.limit ?? 50 },
      { enabled: enabled && !!serviceObjectId }
    )
  )
}
```

Bestehende `useCreateWhWithdrawal` / `useCreateBatchWhWithdrawal` /
`useCancelWhWithdrawal` bekommen in `onSuccess` eine zusätzliche
Invalidierung:

```ts
queryClient.invalidateQueries({
  queryKey: trpc.warehouse.withdrawals.listByServiceObject.queryKey(),
})
```

### Neue Components

**`src/components/serviceobjects/last-service-card.tsx`**

Kompakte Card oben auf dem Übersicht-Tab. Props `serviceObjectId`,
`onViewHistory?: () => void`. Nutzt `useServiceObjectHistory(id, { limit: 1 })`.

States:
- `isLoading`: Skeleton.
- `orders.length === 0`: Leerzustand „Noch kein Einsatz erfasst".
- Sonst: Datum (formatiert `dd.MM.yyyy`), Techniker-Liste
  (`assignedEmployees` als Namen kommagetrennt), Stunden
  (`summary.totalMinutes / 60` als `H:MM` oder Dezimalstunden),
  Badge „vor X Tagen" (via `Intl.RelativeTimeFormat` oder simpler
  `Math.floor((now - lastBookingDate) / 86400000)`), Button
  „Zur Historie" → `onViewHistory()`.

**`src/components/serviceobjects/service-object-history-tab.tsx`**

Tab-Container für den Historie-Tab. Props `serviceObjectId`. Nutzt
`useServiceObjectHistory(id)`. Rendert zwei Sektionen, jeweils mit
Totals-Zeile oben:
- Sektion „Einsätze" (`<ServiceObjectHistoryOrdersTable />`).
- Sektion „Materialentnahmen" (`<ServiceObjectHistoryMovementsTable />`).

Layout: `space-y-6`; auf Desktop optional `md:grid-cols-2` für
Side-by-Side, standardmäßig gestapelt (der Inhalt ist zu breit für
Spalten bei realistischen Datenmengen). Per Ticket: `md:grid-cols-2`
ist "Option", default stacked — wir wählen stacked für Lesbarkeit.

**`src/components/serviceobjects/service-object-history-orders-table.tsx`**

Props `items: OrderHistoryItem[]`. Spalten:
- Code (monospace)
- Name
- Status (Badge via bestehender `OrderStatusBadge`-Komponente)
- Zeitraum (`validFrom` – `validTo`)
- Techniker (Liste aus `assignedEmployees`, getrimmt bei >3 Namen,
  Rest als `+N weitere`)
- Stunden (`summary.totalMinutes / 60`, formatiert als `H:MM` oder
  `3.5h`)
- Buchungen (`summary.bookingCount`)
- Letzte Buchung (`summary.lastBookingDate`, dd.MM.yyyy)

Leerzustand: `serviceObjects.history.emptyOrders`.

**`src/components/serviceobjects/service-object-history-movements-table.tsx`**

Props `items: StockMovementHistoryItem[]`. Spalten:
- Datum (dd.MM.yyyy HH:mm)
- Typ (Badge: Withdrawal/Return/DeliveryNote)
- Artikel (`articleNumber` + `articleName`)
- Menge (vorzeichenbehaftet, grün/rot)
- Benutzer (`createdBy.displayName ?? "Unbekannt"`)
- Grund / Notizen (kombiniert, ellipsis)

Leerzustand: `serviceObjects.history.emptyMovements`.

### Erweiterte Seiten

**`src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx`**

- Tabs auf **kontrolliert** umstellen (siehe Deviation Notes):
  `const [activeTab, setActiveTab] = React.useState<"overview" | "history" | "tree" | "attachments">("overview")`
  + `<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as …)}>`.
- Tab-Reihenfolge: Übersicht, **Historie**, Hierarchie, Anhänge.
- `<LastServiceCard serviceObjectId={id} onViewHistory={() => setActiveTab("history")} />`
  als erstes Kind von `<TabsContent value="overview">`.
- Neuer `<TabsContent value="history">`-Block mit
  `<ServiceObjectHistoryTab serviceObjectId={id} />`.

**`src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`**

Nach dem `serviceCases`-Tab einen neunten Tab einhängen:

```tsx
<TabsTrigger value="serviceObjects">{t('tabServiceObjects')}</TabsTrigger>
...
<TabsContent value="serviceObjects" className="mt-6">
  <ServiceObjectTreeView customerAddressId={address.id} />
</TabsContent>
```

`<ServiceObjectTreeView>` existiert bereits und akzeptiert
`customerAddressId`. Wir reuse es ohne neue Komponente (siehe
Deviation Notes für die leichte Abweichung vom Ticket).

**`src/components/warehouse/withdrawal-history.tsx`**

Zwei Änderungen:

1. `ReferenceDisplay` um Serviceobjekt-Branch ergänzen (vor dem
   `—`-Fallback):

```tsx
if (movement.serviceObjectId) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Building2 className="h-3.5 w-3.5 text-emerald-500" />
      <span className="font-mono">{movement.serviceObjectId.slice(0, 8)}...</span>
    </div>
  )
}
```

2. Neue User-Spalte (Desktop-Table) + Mobile-Card-Variante. User-Namen
   werden client-seitig aufgelöst: Der `list`-Endpoint (`warehouse.withdrawals.list`)
   liefert heute `createdById` bereits durch (Prisma-Default). Wir
   nutzen einen neuen Hook-Aufruf parallel zur `useWhWithdrawals`-Query:

```tsx
const createdByIds = (data?.items ?? []).map((m) => m.createdById).filter(Boolean)
// Batch-Resolver via tRPC-Procedure (siehe unten)
const { data: userMap } = useUserDisplayNames(createdByIds)
```

Das erfordert eine **zusätzliche** tRPC-Procedure `users.resolveDisplayNames`
für die Warehouse-Views. Um Scope-Creep zu vermeiden, extend-en wir
stattdessen den `list`-Endpoint:

```ts
// withdrawals.ts — list-Procedure Output zusätzlich:
include: {
  article: { select: { id: true, number: true, name: true, unit: true } },
  serviceObject: { select: { id: true, number: true, name: true } },
}
// + client-seitig anzeigen
```

Für den User-Namen nehmen wir den einfachsten Weg: erweitere das
`listWithdrawals`-Service um einen optionalen Include-Helper, der
`createdById`-UUIDs via `userDisplayNameService.resolveMany` nach dem
Prisma-Roundtrip in Memory joined (weil `createdById` kein `@relation`
hat — Research §4.5). Die Funktion liefert dann `items` mit
zusätzlichem Feld `createdBy: { userId, displayName } | null`.

**Detaillierte Änderung in `wh-withdrawal-service.ts:listWithdrawals`:**

```ts
// Nach dem bestehenden findMany + count
const createdByIds = items
  .map((m) => m.createdById)
  .filter((id): id is string => id !== null)
const userMap = await userDisplayNameService.resolveMany(prisma, tenantId, createdByIds)
const enriched = items.map((m) => ({
  ...m,
  createdBy: m.createdById
    ? { userId: m.createdById, displayName: userMap.get(m.createdById)?.displayName ?? "Unbekannt" }
    : null,
}))
return { items: enriched, total }
```

Zusätzlich: `include: { article: {...}, serviceObject: { select: { id: true, number: true, name: true } } }`
im `findMany`-Call, damit der ServiceObject-Branch in `ReferenceDisplay`
den Namen rendern kann statt nur eine UUID.

**Resultat für `withdrawal-history.tsx`:**
- `ReferenceDisplay` rendert Serviceobjekt als Name + Nummer statt
  UUID-Slice.
- Neue Spalte „Benutzer" im Desktop-Table; im Mobile-Card-View eine
  weitere Zeile unterhalb Datum mit dem Benutzernamen.

**`src/components/warehouse/article-movements-tab.tsx`**

Drei Änderungen:

1. `typeVariants` + `typeKeys` um `DELIVERY_NOTE` ergänzen (heute `undefined`):

```ts
const typeVariants: Record<MovementType, 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'cyan'> = {
  GOODS_RECEIPT: 'green',
  WITHDRAWAL: 'red',
  ADJUSTMENT: 'yellow',
  INVENTORY: 'blue',
  RETURN: 'purple',
  DELIVERY_NOTE: 'cyan',
}
const typeKeys: Record<MovementType, string> = {
  ...,
  DELIVERY_NOTE: 'typeDeliveryNote',
}
type MovementType = 'GOODS_RECEIPT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'INVENTORY' | 'RETURN' | 'DELIVERY_NOTE'
```

   (`typeDeliveryNote` i18n-Key neu unter `warehouseStockMovements`.)

2. Analog wie bei `withdrawal-history`: `listByArticle` (Service
   `wh-stock-movement-service.ts:listByArticle` → repo
   `wh-stock-movement-repository.ts:findByArticle`) joined die
   User-Namen in Memory:

```ts
// wh-stock-movement-service.ts — listByArticle erweitern
const items = await repo.findByArticle(...)
const createdByIds = items.map((m) => m.createdById).filter((id): id is string => !!id)
const userMap = await userDisplayNameService.resolveMany(prisma, tenantId, createdByIds)
return items.map((m) => ({
  ...m,
  createdBy: m.createdById
    ? { userId: m.createdById, displayName: userMap.get(m.createdById)?.displayName ?? "Unbekannt" }
    : null,
}))
```

3. Neue User-Spalte rechts neben „Grund":

```tsx
<TableHead>{t('colCreatedBy')}</TableHead>
...
<TableCell className="text-sm">
  {movement.createdBy?.displayName ?? '—'}
</TableCell>
```

   (`colCreatedBy` existiert bereits als i18n-Key, `de.json:6451`.)

### i18n-Keys (neu)

Unter neuem Namespace `serviceObjects` in `messages/de.json` +
`messages/en.json`:

```json
"serviceObjects": {
  "tabs": {
    "history": "Historie"  // EN: "History"
  },
  "history": {
    "ordersSection": "Einsätze",  // EN: "Jobs"
    "movementsSection": "Materialentnahmen",  // EN: "Stock Movements"
    "emptyOrders": "Keine Einsätze für dieses Serviceobjekt.",
    "emptyMovements": "Keine Materialentnahmen für dieses Serviceobjekt.",
    "loadMore": "Mehr laden",
    "colCode": "Auftrag",
    "colName": "Bezeichnung",
    "colStatus": "Status",
    "colValidFrom": "Start",
    "colValidTo": "Ende",
    "colTechnicians": "Techniker",
    "colHours": "Std.",
    "colBookings": "Buchungen",
    "colLastBooking": "Letzte Buchung",
    "colDate": "Datum",
    "colType": "Art",
    "colArticle": "Artikel",
    "colQuantity": "Menge",
    "colUser": "Benutzer",
    "colReason": "Grund",
    "totals": {
      "orderCount": "{count, plural, =0 {Keine Einsätze} =1 {1 Einsatz} other {# Einsätze}}",
      "totalHours": "{hours}h insgesamt",
      "movementCount": "{count, plural, =0 {Keine Entnahmen} =1 {1 Entnahme} other {# Entnahmen}}"
    }
  },
  "lastService": {
    "title": "Letzter Einsatz",
    "empty": "Noch kein Einsatz erfasst",
    "daysAgo": "vor {days, plural, =0 {heute} =1 {1 Tag} other {# Tagen}}",
    "viewHistory": "Zur Historie"
  }
}
```

Ergänzung in bestehendem `crmAddresses`-Namespace (`de.json:5655+`):

```json
"tabServiceObjects": "Serviceobjekte"  // EN: "Service Objects"
```

Ergänzung in `warehouseStockMovements`-Namespace:

```json
"typeDeliveryNote": "Lieferschein",  // EN: "Delivery Note"
"colCreatedBy": "Benutzer"  // existiert bereits; sicherstellen, dass Fallback gegeben
```

Ergänzung in `warehouseWithdrawals`-Namespace:

```json
"colUser": "Benutzer",
"refTypeServiceObjectShort": "SO"
```

**Abweichung von bestehendem Pattern:** Die vorhandene
T-1-Detailseite (`serviceobjects/[id]/page.tsx:93-95`) nutzt
hardcoded deutsche Strings („Übersicht", „Hierarchie", „Anhänge").
Wir ziehen sie in diesem Ticket **nicht** auf i18n — nur die neuen
Tab-Labels + Content werden i18n-gepflegt. Das ist bewusst
heterogen und wird in Deviation Notes dokumentiert.

## Tests

### Unit-Tests

**1. `src/lib/services/__tests__/order-booking-aggregator.test.ts`** (neu)

Mock-Prisma via `createMockPrisma` (Muster:
`crm-report-service.test.ts:7-31`):

- Einzel-Variante `getBookingSummaryByOrder`:
  - Gibt Zeros zurück wenn keine Bookings existieren.
  - Summiert `_sum.timeMinutes` korrekt zurück.
  - Scoped `where: { tenantId, orderId }`.
- Batch-Variante `getBookingSummariesByOrders`:
  - Leeres Array → leere Map, kein Prisma-Call.
  - Mehrere Orders → Map mit Eintrag pro Order.
  - Orders ohne Bookings → Default-Entry mit Nullen im Result.
  - Tenant-Isolation: Mock prüft dass `tenantId` in `where` steht.

**2. `src/lib/services/__tests__/user-display-name-service.test.ts`** (neu)

- `resolveMany` mit leerem Array → leere Map, **kein** Prisma-Call.
- Deduplication: IDs `[A, A, B]` → nur ein Prisma-Call mit `in: [A, B]`.
- `displayName`-Fallback-Matrix:
  - firstName + lastName gesetzt → `"First Last"`.
  - Nur firstName → `"First"`.
  - Nur lastName → `"Last"`.
  - Beide leer/null → email.
  - Alles leer → `"Unbekannt"`.
- Unbekannte IDs (nicht im DB-Result) → Map enthält sie nicht
  (Aufrufer fallbackt auf `"Unbekannt"`).

**3. `src/lib/services/__tests__/service-object-service-history.test.ts`** (neu)

Integration-Variante (mit `prisma` aus `@/lib/db/prisma`, analog zu
`overtime-payout-service.integration.test.ts`):

- `HAS_DB`-Guard, `beforeAll` + `afterAll` cleanup.
- Seed: 2 Tenants (T1, T2), 1 SO in T1, 1 SO in T2 mit gleicher
  Struktur.
- Fall A: 3 Orders in T1 mit je 2 Bookings → Totals orderCount=3,
  totalMinutes = Summe aller 6 Bookings.
- Fall B: Cross-Tenant-Isolation — Bookings/Orders/Movements aus T2
  dürfen nicht im Result für T1 auftauchen.
- Fall C: `limit: 1` → liefert nur 1 Order + 1 Movement.
- Fall D: SO-ID nicht existent → wirft `ServiceObjectNotFoundError`.
- Fall E: Movement ohne `createdById` → `createdBy: null`.
- Fall F: Movement mit unbekanntem `createdById` (User gelöscht) →
  `createdBy: { userId, displayName: "Unbekannt" }`.

**4. `src/lib/services/__tests__/wh-withdrawal-service-by-service-object.test.ts`** (neu)

Mock-Prisma-Style:
- `listByServiceObject` filtert auf `serviceObjectId` + Tenant +
  `type: { in: [...] }`.
- Include zieht `article.number` + `article.name`.
- `limit` default 50, max via Procedure-Input geclampt.

### Router-Typecheck

Nach Änderungen an `orders.ts`-Output muss `pnpm typecheck`
vollständig durchlaufen — Front-End-Verbraucher (Order-Tabellen,
Kundendienst-Detail) müssen mit dem neuen nullable-Feld
`serviceObjectId` noch kompilieren.

### E2E-Browser-Test

**`src/e2e-browser/82-service-object-history.spec.ts`** (neu)

Muster: `81-service-objects.spec.ts`. Helpers
`helpers/service-object-fixtures.ts` ggf. erweitert um:
- `createOrderForServiceObject(soId, code, name, dateIso)`
- `createBookingForOrder(orderId, employeeId, minutes, dateIso)`
- `createWithdrawalForServiceObject(soId, articleId, qty)`

Test-Flow:
1. Login als Admin (Session-State aus `.auth/`).
2. `beforeAll`: Reset, Seed-Kunde, 1 SO, 2 Orders (date-gestaffelt),
   3 Bookings, 2 Withdrawals.
3. Navigiere zu `/serviceobjects/[id]`.
4. Prüfe „Letzte Wartung"-Card zeigt das jüngste Order-Datum +
   Summenstunden.
5. Wechsle zum Tab „Historie".
6. Assert: Orders-Sektion 2 Zeilen, Movements-Sektion 2 Zeilen,
   Totals-Badge zeigt korrekte Summen.
7. Assert: Bei Klick auf „Zur Historie" in der Card switched die
   aktive Tab auf Historie (kontrollierte Tabs).
8. Navigiere zu `/crm/addresses/[id]`.
9. Wechsle zum 9. Tab „Serviceobjekte".
10. Assert: Objekt-Liste sichtbar; Klick auf einen Eintrag
    navigiert zurück zu `/serviceobjects/[id]`.
11. `afterAll`: Reset.

## Phased Rollout

### Phase A — Services + Aggregator

#### Overview
Backbone-Services, ohne Router/UI. Nur Unit-Tests.

#### Changes Required
1. Neu: `src/lib/services/order-booking-aggregator.ts`
2. Neu: `src/lib/services/user-display-name-service.ts`
3. Erweitert: `src/lib/services/order-repository.ts`
   (serviceObjectId-Filter + neue `findManyByServiceObject`)
4. Erweitert: `src/lib/services/wh-withdrawal-service.ts`
   (listByServiceObject + createdBy-Enrichment in listWithdrawals)
5. Erweitert: `src/lib/services/wh-stock-movement-service.ts`
   (createdBy-Enrichment in listByArticle)
6. Erweitert: `src/lib/services/service-object-service.ts`
   (getHistoryByServiceObject)
7. Neu: `src/lib/services/__tests__/order-booking-aggregator.test.ts`
8. Neu: `src/lib/services/__tests__/user-display-name-service.test.ts`
9. Neu: `src/lib/services/__tests__/service-object-service-history.test.ts`
   (HAS_DB-Guard)
10. Neu: `src/lib/services/__tests__/wh-withdrawal-service-by-service-object.test.ts`

#### Success Criteria

##### Automated Verification:
- [x] Typecheck passt: `pnpm typecheck`
- [x] Lint passt: `pnpm lint`
- [x] Unit-Tests passieren: `pnpm vitest run src/lib/services/__tests__/order-booking-aggregator.test.ts src/lib/services/__tests__/user-display-name-service.test.ts src/lib/services/__tests__/wh-withdrawal-service-by-service-object.test.ts`
- [x] Integration-Test passt bei DB: `pnpm vitest run src/lib/services/__tests__/service-object-service-history.test.ts`
- [ ] Coverage ≥ 80% für `order-booking-aggregator.ts` +
      `user-display-name-service.ts`: `pnpm vitest run --coverage <files>`

##### Manual Verification:
- [ ] Kein Regression-Effekt auf bestehende Order/Withdrawal-Tests.
- [ ] `listWithdrawals`-Result im Prisma-Studio: `items[].createdBy`
      ist vorhanden + korrekt aufgelöst.

**Implementation Note:** Nach Phase A, Commit:
`Add history aggregation services (Phase A)`. PAUSE für manuelle
Verifikation.

---

### Phase B — tRPC-Router-Erweiterungen

#### Overview
Exposes die Services via tRPC. Vorhandene Procedures werden erweitert;
zwei neue werden angelegt.

#### Changes Required
1. Erweitert: `src/trpc/routers/orders.ts`
   - `orderOutputSchema` um `serviceObjectId` ergänzen
   - `list`-Input um `serviceObjectId?` ergänzen
   - `mapOrderToOutput` propagiert Feld
2. Erweitert: `src/trpc/routers/serviceObjects.ts`
   - `getHistory`-Procedure hinzufügen
3. Erweitert: `src/trpc/routers/warehouse/withdrawals.ts`
   - `listByServiceObject`-Procedure hinzufügen

#### Success Criteria

##### Automated Verification:
- [x] Typecheck passt: `pnpm typecheck`
- [x] Lint passt: `pnpm lint`
- [ ] Router-Kompilierung (tRPC): `pnpm build` läuft durch.
- [ ] Bestehende Router-Tests (falls vorhanden) bleiben grün:
      `pnpm vitest run src/trpc/routers`

##### Manual Verification:
- [ ] Tree-shaking: `serviceObjects.getHistory` + `warehouse.withdrawals.listByServiceObject`
      sind im Client-Router-Typ sichtbar (z. B. via Hover in IDE).
- [ ] tRPC-Panel (dev) kann `serviceObjects.getHistory` mit einer
      valid SO-UUID erfolgreich aufrufen.

**Implementation Note:** Nach Phase B, Commit:
`Wire history procedures to router (Phase B)`. PAUSE für manuelle
Verifikation.

---

### Phase C — Serviceobjekt-Detail UI

#### Overview
Baut die sichtbare Historie auf der SO-Detailseite.

#### Changes Required
1. Erweitert: `src/hooks/use-service-objects.ts`
   (useServiceObjectHistory)
2. Erweitert: `src/hooks/use-wh-withdrawals.ts`
   (useWhWithdrawalsByServiceObject + Invalidierung in Mutation-Hooks)
3. Neu: `src/components/serviceobjects/last-service-card.tsx`
4. Neu: `src/components/serviceobjects/service-object-history-tab.tsx`
5. Neu: `src/components/serviceobjects/service-object-history-orders-table.tsx`
6. Neu: `src/components/serviceobjects/service-object-history-movements-table.tsx`
7. Erweitert: `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx`
   (Tabs auf kontrolliert umstellen, LastServiceCard einbetten,
   Historie-Tab hinzufügen)
8. Erweitert: `messages/de.json` + `messages/en.json`
   (`serviceObjects.*`-Namespace + `serviceObjects.lastService.*`)

#### Success Criteria

##### Automated Verification:
- [x] Typecheck passt: `pnpm typecheck`
- [ ] Lint passt: `pnpm lint`
- [ ] Build passt: `pnpm build`
- [ ] E2E-Basis (`81-service-objects.spec.ts`) bleibt grün:
      `pnpm playwright test src/e2e-browser/81-service-objects.spec.ts`

##### Manual Verification:
- [ ] Navigiere zu `/serviceobjects/[id]` mit einem SO, das ≥1 Order
      und ≥1 Withdrawal hat → „Letzte Wartung"-Card zeigt korrektes
      Datum + Techniker.
- [ ] Leerzustand: SO ohne Orders → Card zeigt „Noch kein Einsatz
      erfasst".
- [ ] Tab-Wechsel „Historie" → beide Sektionen rendern; Totals
      stimmen.
- [ ] Klick auf „Zur Historie" in der Card → wechselt tatsächlich zum
      Historie-Tab.

**Implementation Note:** Nach Phase C, Commit:
`Render service object history UI (Phase C)`. PAUSE für manuelle
Verifikation.

---

### Phase D — CRM-Address-Detail + Warehouse-UI-Fixes

#### Overview
Erweiterungen außerhalb der SO-Detailseite.

#### Changes Required
1. Erweitert: `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`
   (9. Tab „Serviceobjekte", `<ServiceObjectTreeView>` wiederverwenden)
2. Erweitert: `src/components/warehouse/withdrawal-history.tsx`
   (ServiceObject-Branch in `ReferenceDisplay`, User-Spalte)
3. Erweitert: `src/components/warehouse/article-movements-tab.tsx`
   (User-Spalte + `DELIVERY_NOTE` im typeVariants-Map ergänzen)
4. Erweitert: `messages/de.json` + `messages/en.json`
   (`crmAddresses.tabServiceObjects`,
   `warehouseStockMovements.typeDeliveryNote`,
   `warehouseWithdrawals.colUser`)

#### Success Criteria

##### Automated Verification:
- [x] Typecheck passt: `pnpm typecheck`
- [ ] Lint passt: `pnpm lint`
- [ ] Build passt: `pnpm build`
- [ ] Bestehende Warehouse-E2E (`44-wh-withdrawals.spec.ts`) bleibt
      grün: `pnpm playwright test src/e2e-browser/44-wh-withdrawals.spec.ts`

##### Manual Verification:
- [ ] `/crm/addresses/[id]` → 9. Tab „Serviceobjekte" ist sichtbar
      und navigierbar.
- [ ] Warehouse Withdrawal-History → ein Withdrawal mit
      `referenceType=SERVICE_OBJECT` rendert jetzt den SO-Namen
      statt `—`.
- [ ] Warehouse Withdrawal-History → Benutzer-Spalte zeigt „Hans
      Müller" statt einer UUID.
- [ ] Artikel-Detail → Movements-Tab hat eine neue Spalte „Benutzer".
- [ ] DELIVERY_NOTE-Movements bekommen jetzt ein Badge (vorher:
      `undefined`).

**Implementation Note:** Nach Phase D, Commit:
`Add service object tab to CRM + user column to warehouse views (Phase D)`.
PAUSE für manuelle Verifikation.

---

### Phase E — E2E + Handbuch

#### Overview
E2E-Coverage für den End-to-End-Flow + Handbuch-Doku.

#### Changes Required
1. Neu: `src/e2e-browser/82-service-object-history.spec.ts`
2. Ggf. erweitert: `src/e2e-browser/helpers/service-object-fixtures.ts`
   (neue Helpers für Order/Booking/Withdrawal-Seeding)
3. Erweitert: `TERP_HANDBUCH.md` im Serviceobjekte-Abschnitt um:
   - „Historie einsehen" (Click-Pfad: Detailseite → Tab Historie →
     Orders + Movements)
   - „Letzter Einsatz" (Click-Pfad: Detailseite → Übersicht → Card)
   - CRM-Kontext: „Serviceobjekte-Tab am Kunden"

#### Success Criteria

##### Automated Verification:
- [ ] Neuer E2E-Spec passt: `pnpm playwright test src/e2e-browser/82-service-object-history.spec.ts`
- [ ] Komplette E2E-Suite passt: `pnpm playwright test`
- [ ] Markdown-Lint (falls konfiguriert) passt für `TERP_HANDBUCH.md`

##### Manual Verification:
- [ ] Handbuch-Abschnitt: Ein unerfahrener Leser kann den
      beschriebenen Weg Schritt-für-Schritt nachklicken und landet
      bei korrekten Inhalten (Feedback-Regel „Handbook as
      verification").
- [ ] Screenshots/Beschreibungen im Handbuch spiegeln die
      tatsächliche UI wider.
- [x] Typecheck-Stand unverändert (9 Baseline-Errors, 0 neue).

**Implementation Note:** Nach Phase E, Commit:
`Add E2E test and handbook update (Phase E)`. Endet das Ticket.

---

## Testing Strategy

### Unit Tests
- Aggregator-Grundbausteine (`order-booking-aggregator`,
  `user-display-name-service`) mit Mock-Prisma — decken alle
  Kanten (leer, Single, Batch, Dedup, Fallbacks).
- Service-Layer-Logik (`service-object-service-history`) als
  Integration-Test mit echter DB — deckt Cross-Tenant-Isolation und
  Zusammenspiel aller vier Unter-Services.

### Integration Tests
- `getHistoryByServiceObject` gegen echtes Postgres (per HAS_DB-Guard).
- `listWithdrawals` + `listByArticle` Enrichment: mindestens ein
  Integration-Test, der verifiziert dass `createdBy.displayName`
  korrekt aufgelöst wird.

### Manual Testing Steps
1. Lege einen Kunden an, lege ein Serviceobjekt an, lege 2 Orders
   mit unterschiedlichen Mitarbeitern + Datum an, buche je 2
   Booking-Einträge pro Order, nimm 3 Artikel als Withdrawal für
   das SO mit.
2. Navigiere zu `/serviceobjects/[id]`. Prüfe:
   - „Letzte Wartung"-Card korrekt.
   - Tab „Historie": beide Sektionen korrekt befüllt.
   - Summen stimmen.
3. Navigiere zu `/crm/addresses/[id]`. Prüfe:
   - 9. Tab „Serviceobjekte" listet das SO auf.
4. Navigiere zu `/warehouse/withdrawals`. Prüfe:
   - Withdrawals zum SO rendern Referenz als Name statt `—`.
   - User-Spalte zeigt Namen statt UUID.
5. Navigiere zu `/warehouse/articles/[id]` → Tab „Lagerbewegungen".
   Prüfe:
   - Neue Spalte „Benutzer" vorhanden.
   - DELIVERY_NOTE-Badges funktionieren.
6. Mobile-Viewport (375px): Alle neuen Komponenten rendern ohne
   Overflow (keine mobile-first-Umstellung, aber graceful degradation).

## Hard Rules

- **Datei-Budget:** 18 produktive Dateien (neu oder editiert) + Tests
  + E2E + Handbuch. Richtgröße 15-20 eingehalten.
- **Keine neuen DB-Spalten, keine neuen Entitäten, keine neuen
  Migrationen.**
- **Keine Änderung an T-1-Hard-Rules:** `Order.customer`-Freitext
  bleibt, `WhStockMovement.machineId` bleibt, keine
  Platform↔ServiceObject-`@relation`.
- **Keine Änderung am QR-Scan-Flow.**
- **Keine Denormalisierung** — alle Aggregate on-demand.
- **`getHistory` liefert alle Daten in einem Roundtrip** — eine
  tRPC-Procedure, intern ein `Promise.all` (2 Parallel-Wellen:
  Orders+Movements, dann Summaries+Users). Kein Waterfall-Loading
  im Frontend.
- **User-Displayname-Fallback ist deterministisch:**
  firstName+lastName → email → "Unbekannt". Kein Null/Undefined auf
  UI-Ebene.
- **Aggregate-Patterns per Research §7.7:**
  - Summen via `groupBy` mit `_sum`/`_count`/`_max`.
  - Latest-Record-Pfad nicht nötig (Batch-groupBy liefert Max).
  - **Kein `$queryRaw`** in diesem Ticket — Prisma-Semantik reicht.
- **Tenant-Scoping:** Jede neue Query enthält `tenantId` in der
  `where`-Klausel. `resolveMany` enthält `tenantId` zusätzlich zu
  `id: { in: ids }` als Defense-in-Depth.
- **Empty-Input-Short-Circuit:** `resolveMany([])` und
  `getBookingSummariesByOrders([])` returnen ohne Prisma-Call (Cost +
  Sicherheit gegen Pan-Tenant-`in`-Listen).
- **Tests ≥ 80% Coverage** für `order-booking-aggregator.ts` +
  `user-display-name-service.ts`.
- **Keine neuen Permissions** — `service_objects.view` + `wh_stock.view`
  reichen.
- **i18n-Tenant-Only-Regel:** Alle neuen UI-Texte auf Tenant-Seite
  nutzen `useTranslations`/next-intl-Keys. Bestehende Hardcode-Strings
  in T-1-Page bleiben für dieses Ticket unangetastet.
- **No-AI-Borders-Regel:** Keine farbigen Left-Border-Akzente auf
  Cards. Dezente Badges/Icons OK.

## Deviation Notes

Abweichungen vom Prompt-Wortlaut mit konkreten Datei/Zeilen-Referenzen:

**1. Tabs-Komponente wird von uncontrolled auf controlled umgestellt.**

*Grund:* Ticket §11 verlangt "Link 'Zur Historie' (wechselt zum neuen
Historie-Tab)" im `LastServiceCard`. Die existierende Implementierung
(`serviceobjects/[id]/page.tsx:91`) läuft uncontrolled via
`defaultValue="overview"`. Um den programmatischen Tab-Wechsel
(Click-Callback) zu erlauben, führen wir `activeTab`-State ein und
binden `<Tabs value={activeTab} onValueChange={setActiveTab}>`. Kein
URL-State (konsequent mit CRM-Address-Detail).

*Umfang:* 4-5 Zeilen Änderung in `serviceobjects/[id]/page.tsx`, keine
API-Änderung an shadcn-`Tabs`.

**2. `findManyByServiceObject` als separate Funktion statt
Option-Flag in `findMany`.**

*Ticket §4 schlägt vor:* "Include `assignments.employee.{...}` bei
entsprechendem Option-Flag (oder immer — billig)."

*Gewählt:* Separate Funktion `findManyByServiceObject`. Grund: Der
allgemeine `orders.list`-Pfad (admin/orders-page mit evtl. hunderten
Orders) braucht das Assignments-Include **nicht** und soll nicht
regressiv langsamer werden. Separate Funktion isoliert die Kosten auf
den History-Pfad (begrenzt auf `limit: 50`).

*Datei:* `src/lib/services/order-repository.ts`. Minimal-invasiv:
`findMany`-Signatur bekommt nur den neuen `serviceObjectId?`-Filter,
KEIN Assignments-Include.

**3. CRM-Address-Serviceobjekte-Tab reuse `<ServiceObjectTreeView>`
statt "Tabellen-Variante".**

*Ticket §9 schlägt vor:* "existierende `ServiceObjectTreeView` +
Tabellen-Variante wiederverwenden."

*Gewählt:* Nur `<ServiceObjectTreeView>` — die „Tabellen-Variante"
existiert nicht als eigenständige Komponente (die Liste unter
`/serviceobjects` ist full-page mit Filtern, Pagination, Sheet-Einbettung).
Reines Tree-Rendering ist die kürzeste Lösung, die dem Benutzer die
Hierarchie beim Kunden zeigt. Bei Bedarf später eine kompakte
Tabellen-Variante als Follow-up.

*Datei:* `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`,
ca. 3 Zeilen Änderung.

**4. User-Namen-Enrichment in `listWithdrawals` + `listByArticle`
erfolgt im Service-Layer in Memory (nicht via Prisma-`@relation`).**

*Grund:* `WhStockMovement.createdById` und `OrderBooking.employeeId`
haben **keine** `@relation`-Deklaration (Research §4.5). Ein Schema-
Change ist per Hard-Rule ausgeschlossen. Also resolven wir nach dem
Prisma-Roundtrip via separatem `prisma.user.findMany({ where: { id: { in } } })`
und mappen in Memory. Kosten: 1 extra Query pro List-Call, O(N) in
der Memory-Schleife. Bei 50 Items vernachlässigbar.

**5. `article-movements-tab.tsx` bekommt als Bonus auch den
`DELIVERY_NOTE`-Badge-Support.**

*Grund:* Research §4.4 dokumentiert dass `typeVariants`/`typeKeys`
heute `DELIVERY_NOTE` nicht kennen — Badge rendert `undefined`. Da
wir die Datei ohnehin anfassen, fixen wir das in einem Rutsch.
Kein zusätzlicher Scope — 2 Zeilen + 1 i18n-Key.

**6. Namespace-Wahl für neue i18n-Keys: `serviceObjects` (neu) +
Extensions zu bestehenden Namespaces.**

Keine Kollision mit existierenden Namespaces. Die T-1-Detailseite
nutzt aktuell hardcoded deutsche Strings — wir migrieren sie in
diesem Ticket **nicht** auf i18n (explizit "Not Doing"). Nur die
neuen Historie-Inhalte bekommen i18n-Keys.

## Migration Notes

Keine Migration notwendig. FK-Spalten + Indices sind seit T-1
vorhanden. Alle Aggregationen sind on-demand — kein Backfill.

## Open Questions

Keine. Alle Architektur-Entscheidungen sind im Ticket vorgezeichnet
und im Research §7 + §8 als IST-Befund abgesichert.

## References

- Ticket: `/create_plan`-Prompt vom 2026-04-21 (Serviceobjekte —
  Einsatz-Historie auf der Detailseite, T-2)
- Research: `thoughts/shared/research/2026-04-21-serviceobjekte-historie-codebase-analyse.md`
- T-1-Plan: `thoughts/shared/plans/2026-04-21-serviceobjekte-stammdaten.md`
- Prisma-Model Order: `prisma/schema.prisma:2467-2503`,
  `serviceObjectId` Z. 2482, `@@index([tenantId, serviceObjectId])`
- Prisma-Model WhStockMovement: `prisma/schema.prisma:5515-5551`,
  `serviceObjectId` Z. 5531, `@@index([tenantId, serviceObjectId])`
- Prisma-Model OrderBooking: `prisma/schema.prisma:5239-5268`
- Prisma-Model OrderAssignment: `prisma/schema.prisma:2514-2537`
- GroupBy-Pattern-Vorbild:
  `src/lib/services/payroll-export-repository.ts:200-209`
- Test-Mock-Style-Vorbild:
  `src/lib/services/__tests__/crm-report-service.test.ts:7-31`
- Integration-Test-Vorbild:
  `src/lib/services/__tests__/overtime-payout-service.integration.test.ts`
- Router-Output-Schema-Stelle (Änderung): `src/trpc/routers/orders.ts:38-54`
- Router-Input-Schema-Stelle (Änderung): `src/trpc/routers/orders.ts:144-151`
- Router-Mapper-Stelle (Änderung): `src/trpc/routers/orders.ts:91-128`
- Order-Repo (Änderung): `src/lib/services/order-repository.ts:16-35`
- `listByOrder`-Vorbild: `src/lib/services/wh-withdrawal-service.ts:433-447`
- SO-Detailseite (Änderung):
  `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx:91-96`
- CRM-Address-Detail (Änderung):
  `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx:257-267`
- Withdrawal-History-`ReferenceDisplay`:
  `src/components/warehouse/withdrawal-history.tsx:37-65`
- Article-Movements-Tab-Spalten:
  `src/components/warehouse/article-movements-tab.tsx:87-93`
- Bestehender E2E-Test: `src/e2e-browser/81-service-objects.spec.ts`
- E2E-Helpers: `src/e2e-browser/helpers/service-object-fixtures.ts`
