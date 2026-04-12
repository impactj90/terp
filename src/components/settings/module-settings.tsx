'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useModules } from '@/hooks'
import { AVAILABLE_MODULES } from '@/lib/modules/constants'

/**
 * Module settings card for the admin settings page.
 *
 * Phase 9: read-only for tenants. Module booking is an operator-hoheit
 * action driven from /platform/tenants/[id]/modules — the tenant-side
 * endpoints were removed, so any caller attempting to toggle these
 * switches would fail at compile time.
 */
export function ModuleSettings() {
  const t = useTranslations('modules')
  const { data, isLoading, error } = useModules()

  const enabledSet = React.useMemo(() => {
    if (!data?.modules) return new Set<string>(['core'])
    return new Set(data.modules.map((m) => m.module))
  }, [data])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {AVAILABLE_MODULES.map((module) => {
          const isEnabled = enabledSet.has(module)

          return (
            <div
              key={module}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="space-y-0.5">
                <Label htmlFor={`module-${module}`} className="text-sm">
                  {t(`name_${module}` as Parameters<typeof t>[0])}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(`desc_${module}` as Parameters<typeof t>[0])}
                </p>
              </div>
              <Switch
                id={`module-${module}`}
                checked={isEnabled}
                disabled
              />
            </div>
          )
        })}
        <p className="pt-2 text-xs text-muted-foreground">
          {t('readOnlyHint')}
        </p>
      </CardContent>
    </Card>
  )
}
