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
