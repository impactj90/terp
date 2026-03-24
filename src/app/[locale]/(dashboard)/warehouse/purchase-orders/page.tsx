'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { PurchaseOrderList } from '@/components/warehouse/purchase-order-list'

export default function WhPurchaseOrdersPage() {
  const t = useTranslations('warehousePurchaseOrders')
  const { allowed: canAccess } = useHasPermission(['wh_purchase_orders.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <PurchaseOrderList />
    </div>
  )
}
