'use client'

import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface DunningPreFlightBannerProps {
  settings: { enabled: boolean } | null
  templates: { id: string }[] | null
  onGoToSettings: () => void
  onGoToTemplates: () => void
}

export function DunningPreFlightBanner({
  settings,
  templates,
  onGoToSettings,
  onGoToTemplates,
}: DunningPreFlightBannerProps) {
  const t = useTranslations('billingDunning')

  if (!settings) return null

  if (!settings.enabled) {
    return (
      <Alert
        data-testid="pre-flight-banner"
        className="border-yellow-500/40 bg-yellow-500/5"
      >
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{t('preFlight.disabled')}</span>
          <Button size="sm" variant="outline" onClick={onGoToSettings}>
            {t('preFlight.goToSettings')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!templates || templates.length === 0) {
    return (
      <Alert
        data-testid="pre-flight-banner"
        className="border-yellow-500/40 bg-yellow-500/5"
      >
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{t('preFlight.noTemplates')}</span>
          <Button size="sm" variant="outline" onClick={onGoToTemplates}>
            {t('preFlight.goToTemplates')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
