'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Info } from 'lucide-react'

export function DsgvoInfoCard() {
  const t = useTranslations('dsgvo.info')

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-5 w-5 text-blue-500" />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{t('description')}</p>

        <div>
          <p className="font-medium text-foreground">{t('legalRetention')}</p>
          <p className="mt-1">{t('legalNote')}</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            <li>{t('personnelFile')}</li>
            <li>{t('stockMovements')}</li>
            <li>{t('monthlyValues')}</li>
          </ul>
        </div>

        <p>{t('anonymizeNote')}</p>
        <p>{t('cronNote')}</p>
      </CardContent>
    </Card>
  )
}
