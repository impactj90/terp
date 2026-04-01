'use client'

import { useHasPermission } from '@/hooks'
import { PriceManagement } from '@/components/warehouse/price-management'
import { useTranslations } from 'next-intl'

export default function WhPricesPage() {
  const t = useTranslations('warehousePrices')
  const { allowed: canViewPrices } = useHasPermission(['billing_price_lists.view'])
  const { allowed: canViewArticles } = useHasPermission(['wh_articles.view'])

  if (canViewPrices === false || canViewArticles === false) {
    return (
      <div className="p-6 text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-semibold">{t('title')}</h1>
      <PriceManagement />
    </div>
  )
}
