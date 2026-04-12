'use client'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { PurchaseOrderDetail } from '@/components/warehouse/purchase-order-detail'

export default function WhPurchaseOrderDetailPage() {
  const t = useTranslations('warehousePurchaseOrders')
  const params = useParams<{ id: string }>()
  const { allowed: canAccess } = useHasPermission(['wh_purchase_orders.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return <PurchaseOrderDetail id={params.id} />
}
