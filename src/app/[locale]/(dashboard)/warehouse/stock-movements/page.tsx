'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { StockMovementList } from '@/components/warehouse/stock-movement-list'

export default function WhStockMovementsPage() {
  const t = useTranslations('warehouseStockMovements')
  const { allowed: canAccess } = useHasPermission(['wh_stock.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <StockMovementList />
    </div>
  )
}
