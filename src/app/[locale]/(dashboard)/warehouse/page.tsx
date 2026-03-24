'use client'

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
