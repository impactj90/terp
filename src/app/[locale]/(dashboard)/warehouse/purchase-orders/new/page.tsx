'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { PurchaseOrderForm } from '@/components/warehouse/purchase-order-form'

export default function WhPurchaseOrderNewPage() {
  const t = useTranslations('warehousePurchaseOrders')
  const { allowed: canAccess } = useHasPermission(['wh_purchase_orders.create'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return <PurchaseOrderForm />
}
