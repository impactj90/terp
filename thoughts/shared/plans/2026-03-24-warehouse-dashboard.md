# Warehouse Dashboard Implementation Plan

## Overview

Create a `/warehouse` dashboard page that serves as the landing page for the warehouse module. Currently this route returns a 404 — the nav item `warehouseOverview` already points to `/warehouse` but no `page.tsx` exists. The dashboard will display KPI cards, action-required lists, and an activity feed using mostly existing backend endpoints plus two new ones.

## Current State Analysis

**What exists:**
- 8 warehouse sub-pages under `/warehouse/*` (articles, prices, purchase-orders, goods-receipt, withdrawals, stock-movements, supplier-invoices)
- Nav config already has `warehouseOverview` → `/warehouse` with no permission guard (`sidebar-nav-config.ts:371`)
- Translation keys `nav.warehouseOverview` = "Lagerübersicht" / "Warehouse Overview" already exist
- Existing hooks in `src/hooks/use-wh-*.ts` for all warehouse queries
- `useWhSupplierInvoiceSummary` hook already wraps `warehouse.supplierInvoices.summary` endpoint
- `useWhReorderSuggestions` hook already wraps `warehouse.purchaseOrders.reorderSuggestions` endpoint
- `useWhPendingOrders` hook already wraps `warehouse.stockMovements.goodsReceipt.listPendingOrders`
- `useWhArticles` hook supports `belowMinStock: true` filter
- `useWhPurchaseOrders` hook supports `status` filter
- Reusable `StatsCard` component exists at `src/components/dashboard/stats-card.tsx`

**What's missing:**
- `src/app/[locale]/(dashboard)/warehouse/page.tsx` — the actual page
- Backend endpoint for total stock value (`SUM(currentStock * buyPrice)`)
- Backend endpoint for recent stock movements (last N, lightweight)
- Dashboard components for warehouse KPIs
- Translation namespace `warehouseDashboard` in `de.json` / `en.json`

### Key Discoveries:
- Main dashboard pattern at `src/app/[locale]/(dashboard)/dashboard/page.tsx:53-74` uses `space-y-6` layout with grid rows
- KPI cards follow `rounded-lg border bg-card p-6` pattern with `text-2xl font-bold` values
- `StatsCard` component (`src/components/dashboard/stats-card.tsx`) handles loading/error/trend states — we'll reuse it
- `formatCurrency` is defined inline in each component using `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`
- Prisma can't do field-to-field comparison — belowMinStock uses in-memory filter (`wh-article-repository.ts:80-88`)
- `wh-supplier-invoice-service.ts:585-624` `summary()` returns `{ totalOpen, totalOverdue, totalPaidThisMonth, invoiceCount, overdueCount }`
- Stock movements repo at `wh-stock-movement-repository.ts:7-60` already has `findMany` with date/type filters and article includes

## Desired End State

A fully functional warehouse dashboard page at `/warehouse` showing:

1. **5 KPI cards** in a responsive grid:
   - Lagerwert (total stock value in EUR)
   - Artikel unter Mindestbestand (count with link)
   - Offene Bestellungen (count of ORDERED + PARTIALLY_RECEIVED POs)
   - Offene Rechnungen (total open amount in EUR)
   - Überfällige Rechnungen (count + amount, red highlight)

2. **3 action/info sections** in a 2-column + full-width layout:
   - Nachbestellvorschläge (top 5 most urgent, link to `/warehouse/purchase-orders/suggestions`)
   - Ausstehende Wareneingänge (pending POs, link to `/warehouse/goods-receipt`)
   - Letzte Lagerbewegungen (last 10 movements, activity feed style)

### Verification:
- Navigate to `/warehouse` → dashboard renders with real data
- All KPI cards show loading skeletons, then data or error states
- Click on "Alle anzeigen" links → navigate to correct sub-pages
- `pnpm typecheck` passes
- `pnpm lint` passes

## What We're NOT Doing

- No new database migrations or materialized views
- No charts or graphs (keep it simple for v1)
- No permission-gated widgets (the page itself has no permission guard, matching nav config)
- No caching layer beyond React Query defaults
- No tests for the new components (pure UI, tested via E2E later)
- No refactoring of existing hooks or services

## Implementation Approach

Use the existing main dashboard (`src/app/[locale]/(dashboard)/dashboard/page.tsx`) as the structural template. Reuse `StatsCard` for KPI cards. Add two small backend endpoints (stock value summary + recent movements) following the established service → router pattern. Create self-contained dashboard components in `src/components/warehouse/dashboard/`.

---

## Phase 1: Backend — New Endpoints

### Overview
Add two new lightweight query endpoints to the warehouse backend: one for stock value aggregation and one for recent movements.

### Changes Required:

#### 1. Stock Value Summary — Repository
**File**: `src/lib/services/wh-article-repository.ts`
**Changes**: Add `getStockValueSummary` function at end of file

```typescript
export async function getStockValueSummary(
  prisma: PrismaClient,
  tenantId: string
) {
  // Use Prisma raw query for SUM(currentStock * buyPrice) — Prisma ORM
  // doesn't support computed field aggregation.
  const result = await prisma.$queryRaw<
    Array<{ total_value: number; tracked_count: number; below_min_count: number }>
  >`
    SELECT
      COALESCE(SUM("currentStock" * COALESCE("buyPrice", 0)), 0)::float AS total_value,
      COUNT(*)::int AS tracked_count,
      COUNT(*) FILTER (WHERE "minStock" IS NOT NULL AND "currentStock" < "minStock")::int AS below_min_count
    FROM "WhArticle"
    WHERE "tenantId" = ${tenantId}::uuid
      AND "stockTracking" = true
      AND "isActive" = true
  `
  const row = result[0] ?? { total_value: 0, tracked_count: 0, below_min_count: 0 }
  return {
    totalStockValue: Math.round(row.total_value * 100) / 100,
    trackedArticleCount: row.tracked_count,
    belowMinStockCount: row.below_min_count,
  }
}
```

#### 2. Stock Value Summary — Service
**File**: `src/lib/services/wh-article-service.ts`
**Changes**: Add `getStockValueSummary` function at end of file

```typescript
export async function getStockValueSummary(
  prisma: PrismaClient,
  tenantId: string
) {
  return repo.getStockValueSummary(prisma, tenantId)
}
```

#### 3. Stock Value Summary — Router
**File**: `src/trpc/routers/warehouse/articles.ts`
**Changes**: Add `stockValueSummary` procedure to `whArticlesRouter`

```typescript
stockValueSummary: protectedProcedure
  .use(requireModule("warehouse"))
  .use(requirePermission("wh_articles.view"))
  .query(async ({ ctx }) => {
    return whArticleService.getStockValueSummary(ctx.prisma, ctx.tenantId)
  }),
```

#### 4. Recent Movements — Repository
**File**: `src/lib/services/wh-stock-movement-repository.ts`
**Changes**: Add `findRecent` function at end of file

```typescript
export async function findRecent(
  prisma: PrismaClient,
  tenantId: string,
  limit: number = 10
) {
  return prisma.whStockMovement.findMany({
    where: { tenantId },
    include: {
      article: {
        select: { id: true, number: true, name: true, unit: true },
      },
      purchaseOrder: {
        select: { id: true, number: true },
      },
    },
    orderBy: { date: "desc" },
    take: limit,
  })
}
```

#### 5. Recent Movements — Service
**File**: `src/lib/services/wh-stock-movement-service.ts`
**Changes**: Add `listRecent` function at end of file

```typescript
export async function listRecent(
  prisma: PrismaClient,
  tenantId: string,
  limit: number = 10
) {
  return repo.findRecent(prisma, tenantId, limit)
}
```

#### 6. Recent Movements — Router
**File**: `src/trpc/routers/warehouse/stockMovements.ts`
**Changes**: Add `recent` procedure to `movementsRouter`

```typescript
recent: protectedProcedure
  .use(requireModule("warehouse"))
  .use(requirePermission("wh_stock.view"))
  .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
  .query(async ({ ctx, input }) => {
    return stockMovementService.listRecent(ctx.prisma, ctx.tenantId, input.limit)
  }),
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`
- [x] Existing tests still pass: `pnpm test`

#### Manual Verification:
- [ ] Call `warehouse.articles.stockValueSummary` via tRPC — returns `{ totalStockValue, trackedArticleCount, belowMinStockCount }`
- [ ] Call `warehouse.stockMovements.movements.recent` — returns last 10 movements with article data

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Frontend — Hooks

### Overview
Add dashboard-specific hooks to wrap the new endpoints and combine existing ones for the dashboard's needs.

### Changes Required:

#### 1. Dashboard Hook File
**File**: `src/hooks/use-wh-dashboard.ts` (NEW)
**Changes**: Create hook file with dashboard-specific queries

```typescript
import { useTRPC } from "@/trpc"
import { useQuery } from "@tanstack/react-query"

export function useWhStockValueSummary(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.stockValueSummary.queryOptions(
      undefined,
      { enabled }
    )
  )
}

export function useWhRecentMovements(limit = 10, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.movements.recent.queryOptions(
      { limit },
      { enabled }
    )
  )
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] No lint errors in new file: `pnpm lint`

---

## Phase 3: Frontend — Dashboard Components

### Overview
Create the warehouse dashboard UI components following the established dashboard pattern.

### Changes Required:

#### 1. Barrel Export
**File**: `src/components/warehouse/dashboard/index.ts` (NEW)

```typescript
export { WarehouseDashboardHeader } from "./warehouse-dashboard-header"
export { StockValueCard } from "./stock-value-card"
export { BelowMinStockCard } from "./below-min-stock-card"
export { OpenOrdersCard } from "./open-orders-card"
export { OpenInvoicesCard } from "./open-invoices-card"
export { OverdueInvoicesCard } from "./overdue-invoices-card"
export { ReorderSuggestionsPanel } from "./reorder-suggestions-panel"
export { PendingReceiptsPanel } from "./pending-receipts-panel"
export { RecentMovementsPanel } from "./recent-movements-panel"
```

#### 2. Dashboard Header
**File**: `src/components/warehouse/dashboard/warehouse-dashboard-header.tsx` (NEW)

Simple header with title and date, following `DashboardHeader` pattern. Uses `useTranslations('warehouseDashboard')`.

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { Warehouse } from 'lucide-react'

export function WarehouseDashboardHeader() {
  const t = useTranslations('warehouseDashboard')
  const locale = useLocale()

  const today = new Date().toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      <div className="flex items-center gap-2">
        <Warehouse className="h-6 w-6" />
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{today}</p>
    </div>
  )
}
```

#### 3. KPI Card — Lagerwert (Stock Value)
**File**: `src/components/warehouse/dashboard/stock-value-card.tsx` (NEW)

Uses `useWhStockValueSummary` hook + `StatsCard` component. Displays total stock value formatted as EUR. Description shows tracked article count.

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhStockValueSummary } from '@/hooks/use-wh-dashboard'
import { Euro } from 'lucide-react'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
}

export function StockValueCard() {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhStockValueSummary()

  return (
    <StatsCard
      title={t('stockValue')}
      value={data ? formatCurrency(data.totalStockValue) : '—'}
      description={data ? t('trackedArticles', { count: data.trackedArticleCount }) : undefined}
      icon={Euro}
      isLoading={isLoading}
      error={error ?? undefined}
      onRetry={() => refetch()}
    />
  )
}
```

#### 4. KPI Card — Artikel unter Mindestbestand
**File**: `src/components/warehouse/dashboard/below-min-stock-card.tsx` (NEW)

Uses `useWhStockValueSummary` (which already returns `belowMinStockCount`). Red trend when count > 0.

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhStockValueSummary } from '@/hooks/use-wh-dashboard'
import { AlertTriangle } from 'lucide-react'

export function BelowMinStockCard() {
  const t = useTranslations('warehouseDashboard')
  const { data, isLoading, error, refetch } = useWhStockValueSummary()

  const count = data?.belowMinStockCount ?? 0

  return (
    <StatsCard
      title={t('belowMinStock')}
      value={data ? String(count) : '—'}
      description={count > 0 ? t('belowMinStockDesc') : t('allStockOk')}
      icon={AlertTriangle}
      trend={data ? (count > 0 ? 'down' : 'up') : undefined}
      trendValue={data ? (count > 0 ? t('actionRequired') : t('ok')) : undefined}
      isLoading={isLoading}
      error={error ?? undefined}
      onRetry={() => refetch()}
    />
  )
}
```

#### 5. KPI Card — Offene Bestellungen
**File**: `src/components/warehouse/dashboard/open-orders-card.tsx` (NEW)

Uses `useWhPurchaseOrders` with `status: 'ORDERED'` and `status: 'PARTIALLY_RECEIVED'` — two queries, sum the totals. Alternatively, call with no status filter and count client-side. Most efficient: two queries with `pageSize: 1` just to get the `total` count.

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useWhPurchaseOrders } from '@/hooks/use-wh-purchase-orders'
import { ShoppingCart } from 'lucide-react'

export function OpenOrdersCard() {
  const t = useTranslations('warehouseDashboard')

  const ordered = useWhPurchaseOrders({ status: 'ORDERED', pageSize: 1 })
  const partial = useWhPurchaseOrders({ status: 'PARTIALLY_RECEIVED', pageSize: 1 })

  const isLoading = ordered.isLoading || partial.isLoading
  const error = ordered.error || partial.error
  const total = (ordered.data?.total ?? 0) + (partial.data?.total ?? 0)

  return (
    <StatsCard
      title={t('openOrders')}
      value={!isLoading && !error ? String(total) : '—'}
      description={
        !isLoading && !error && partial.data
          ? t('partiallyReceived', { count: partial.data.total })
          : undefined
      }
      icon={ShoppingCart}
      isLoading={isLoading}
      error={error ?? undefined}
      onRetry={() => { ordered.refetch(); partial.refetch() }}
    />
  )
}
```

#### 6. KPI Card — Offene Rechnungen
**File**: `src/components/warehouse/dashboard/open-invoices-card.tsx` (NEW)

Uses `useWhSupplierInvoiceSummary`. Shows `totalOpen` as EUR value, `invoiceCount` in description.

#### 7. KPI Card — Überfällige Rechnungen
**File**: `src/components/warehouse/dashboard/overdue-invoices-card.tsx` (NEW)

Uses `useWhSupplierInvoiceSummary`. Shows `overdueCount` as value, `totalOverdue` as EUR in description. Red trend when > 0.

#### 8. Nachbestellvorschläge Panel
**File**: `src/components/warehouse/dashboard/reorder-suggestions-panel.tsx` (NEW)

Uses `useWhReorderSuggestions`. Shows top 5 items in a table (Article, Current Stock, Min Stock, Deficit). Footer link to `/warehouse/purchase-orders/suggestions`. Pattern follows `PendingActions` section card style with `rounded-lg border`, header with border-b, divide-y rows.

#### 9. Ausstehende Wareneingänge Panel
**File**: `src/components/warehouse/dashboard/pending-receipts-panel.tsx` (NEW)

Uses `useWhPendingOrders`. Shows pending POs in a table (PO Number, Supplier, Status). Footer link to `/warehouse/goods-receipt`.

#### 10. Letzte Lagerbewegungen Panel
**File**: `src/components/warehouse/dashboard/recent-movements-panel.tsx` (NEW)

Uses `useWhRecentMovements`. Activity feed style — each row shows: movement type icon/badge, article name, quantity (+/-), date. Pattern follows `RecentActivity` component with `divide-y` rows.

Movement type → icon mapping:
- `GOODS_RECEIPT` → `PackageCheck` (green)
- `WITHDRAWAL` → `PackageMinus` (red)
- `ADJUSTMENT` → `Wrench` (yellow)
- `INVENTORY` → `ClipboardList` (blue)
- `RETURN` → `RotateCcw` (orange)

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`

#### Manual Verification:
- [ ] Each component renders loading skeleton, then data
- [ ] Error states show retry button
- [ ] Links navigate to correct sub-pages

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Page + Translations

### Overview
Create the actual page file and add all required translation keys.

### Changes Required:

#### 1. Warehouse Dashboard Page
**File**: `src/app/[locale]/(dashboard)/warehouse/page.tsx` (NEW)

```typescript
'use client'

import { useTranslations } from 'next-intl'
import {
  WarehouseDashboardHeader,
  StockValueCard,
  BelowMinStockCard,
  OpenOrdersCard,
  OpenInvoicesCard,
  OverdueInvoicesCard,
  ReorderSuggestionsPanel,
  PendingReceiptsPanel,
  RecentMovementsPanel,
} from '@/components/warehouse/dashboard'

export default function WarehousePage() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <WarehouseDashboardHeader />

      {/* KPI Cards Grid — 5 cards in responsive grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StockValueCard />
        <BelowMinStockCard />
        <OpenOrdersCard />
        <OpenInvoicesCard />
        <OverdueInvoicesCard />
      </div>

      {/* Action panels — 2 column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ReorderSuggestionsPanel />
        <PendingReceiptsPanel />
      </div>

      {/* Recent activity — full width */}
      <RecentMovementsPanel />
    </div>
  )
}
```

#### 2. German Translations
**File**: `messages/de.json`
**Changes**: Add `warehouseDashboard` namespace

```json
"warehouseDashboard": {
  "title": "Lagerübersicht",
  "stockValue": "Lagerwert",
  "trackedArticles": "{count} bestandsgeführte Artikel",
  "belowMinStock": "Unter Mindestbestand",
  "belowMinStockDesc": "Artikel müssen nachbestellt werden",
  "allStockOk": "Alle Bestände im Soll",
  "actionRequired": "Handlungsbedarf",
  "ok": "OK",
  "openOrders": "Offene Bestellungen",
  "partiallyReceived": "davon {count} teilgeliefert",
  "openInvoices": "Offene Rechnungen",
  "invoiceCount": "{count} Rechnungen",
  "overdueInvoices": "Überfällige Rechnungen",
  "overdueAmount": "{amount} überfällig",
  "noOverdue": "Keine überfälligen Rechnungen",
  "overdue": "Überfällig",
  "reorderSuggestions": "Nachbestellvorschläge",
  "reorderEmpty": "Keine Nachbestellungen erforderlich",
  "colArticle": "Artikel",
  "colCurrentStock": "Bestand",
  "colMinStock": "Mindest",
  "colDeficit": "Fehlmenge",
  "pendingReceipts": "Ausstehende Wareneingänge",
  "pendingEmpty": "Keine ausstehenden Wareneingänge",
  "colPoNumber": "Bestellung",
  "colSupplier": "Lieferant",
  "colStatus": "Status",
  "colDelivery": "Liefertermin",
  "statusOrdered": "Bestellt",
  "statusPartiallyReceived": "Teilgeliefert",
  "recentMovements": "Letzte Lagerbewegungen",
  "recentEmpty": "Keine Lagerbewegungen vorhanden",
  "movementGoodsReceipt": "Wareneingang",
  "movementWithdrawal": "Entnahme",
  "movementAdjustment": "Korrektur",
  "movementInventory": "Inventur",
  "movementReturn": "Rückgabe",
  "viewAll": "Alle anzeigen",
  "loading": "Laden..."
}
```

#### 3. English Translations
**File**: `messages/en.json`
**Changes**: Add `warehouseDashboard` namespace (same structure as DE, English values)

```json
"warehouseDashboard": {
  "title": "Warehouse Overview",
  "stockValue": "Stock Value",
  "trackedArticles": "{count} tracked articles",
  "belowMinStock": "Below Min Stock",
  "belowMinStockDesc": "Articles need reordering",
  "allStockOk": "All stock levels OK",
  "actionRequired": "Action needed",
  "ok": "OK",
  "openOrders": "Open Orders",
  "partiallyReceived": "{count} partially received",
  "openInvoices": "Open Invoices",
  "invoiceCount": "{count} invoices",
  "overdueInvoices": "Overdue Invoices",
  "overdueAmount": "{amount} overdue",
  "noOverdue": "No overdue invoices",
  "overdue": "Overdue",
  "reorderSuggestions": "Reorder Suggestions",
  "reorderEmpty": "No reorders needed",
  "colArticle": "Article",
  "colCurrentStock": "Stock",
  "colMinStock": "Min",
  "colDeficit": "Deficit",
  "pendingReceipts": "Pending Goods Receipts",
  "pendingEmpty": "No pending goods receipts",
  "colPoNumber": "Order",
  "colSupplier": "Supplier",
  "colStatus": "Status",
  "colDelivery": "Delivery Date",
  "statusOrdered": "Ordered",
  "statusPartiallyReceived": "Partially Received",
  "recentMovements": "Recent Stock Movements",
  "recentEmpty": "No stock movements yet",
  "movementGoodsReceipt": "Goods Receipt",
  "movementWithdrawal": "Withdrawal",
  "movementAdjustment": "Adjustment",
  "movementInventory": "Inventory",
  "movementReturn": "Return",
  "viewAll": "View all",
  "loading": "Loading..."
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Linting passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification:
- [ ] Navigate to `/warehouse` → dashboard renders (no more 404)
- [ ] All 5 KPI cards show correct data
- [ ] Reorder suggestions table shows urgent articles
- [ ] Pending receipts shows open POs
- [ ] Recent movements shows last 10 movements with type badges
- [ ] "Alle anzeigen" links navigate correctly
- [ ] Switching locale (DE/EN) shows correct translations
- [ ] Loading skeletons appear briefly before data loads
- [ ] Empty states show when no data exists

**Implementation Note**: After completing this phase and all verification passes, the feature is complete.

---

## Testing Strategy

### Unit Tests:
- No unit tests for Phase 1-4 (pure UI components + thin service wrappers)
- The new `getStockValueSummary` raw query is simple enough that integration testing via manual verification is sufficient

### Integration Tests:
- Existing warehouse tests continue to pass (no changes to existing endpoints)

### Manual Testing Steps:
1. Start dev server (`pnpm dev`)
2. Navigate to `/warehouse` — verify dashboard renders
3. Check KPI cards show real data from the database
4. Click "Alle anzeigen" on each panel — verify navigation
5. Create a purchase order, book goods receipt — verify dashboard updates
6. Switch to English locale — verify translations

## Performance Considerations

- `stockValueSummary` uses a raw SQL query with a single table scan on `WhArticle` — fast even with thousands of articles
- `recentMovements` is a simple `ORDER BY date DESC LIMIT 10` — uses existing index on `(tenantId, date)`
- KPI cards that share the same hook (`useWhStockValueSummary`) will deduplicate via React Query's cache — only one network request
- `useWhPurchaseOrders` is called twice (for ORDERED and PARTIALLY_RECEIVED) with `pageSize: 1` — minimal data transfer since we only need the `total` count

## References

- Main dashboard pattern: `src/app/[locale]/(dashboard)/dashboard/page.tsx`
- StatsCard component: `src/components/dashboard/stats-card.tsx`
- Warehouse nav config: `src/components/layout/sidebar/sidebar-nav-config.ts:366-425`
- Supplier invoice summary endpoint: `src/lib/services/wh-supplier-invoice-service.ts:585-624`
- Reorder suggestions endpoint: `src/lib/services/wh-purchase-order-service.ts:634-674`
- Stock movement repository: `src/lib/services/wh-stock-movement-repository.ts`
- Article repository: `src/lib/services/wh-article-repository.ts`
- Existing warehouse hooks: `src/hooks/use-wh-*.ts`
