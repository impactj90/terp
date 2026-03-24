'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { GoodsReceiptTerminal } from '@/components/warehouse/goods-receipt-terminal'

export default function WhGoodsReceiptPage() {
  const t = useTranslations('warehouseGoodsReceipt')
  const { allowed: canAccess } = useHasPermission(['wh_stock.manage'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <GoodsReceiptTerminal />
    </div>
  )
}
