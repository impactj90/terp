'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useModules, useEnableModule, useDisableModule } from '@/hooks'
import { AVAILABLE_MODULES } from '@/lib/modules/constants'

/**
 * Module settings card for the admin settings page.
 * Shows all available modules with toggle switches.
 * "core" is always on and cannot be toggled.
 */
export function ModuleSettings() {
  const t = useTranslations('modules')
  const { data, isLoading, error } = useModules()
  const enableMutation = useEnableModule()
  const disableMutation = useDisableModule()

  const enabledSet = React.useMemo(() => {
    if (!data?.modules) return new Set<string>(['core'])
    return new Set(data.modules.map((m) => m.module))
  }, [data])

  const handleToggle = async (module: string, enabled: boolean) => {
    if (module === 'core') return
    if (enabled) {
      await enableMutation.mutateAsync({ module })
    } else {
      await disableMutation.mutateAsync({ module })
    }
  }

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

  const isMutating = enableMutation.isPending || disableMutation.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {AVAILABLE_MODULES.map((module) => {
          const isCore = module === 'core'
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
                onCheckedChange={(checked) => handleToggle(module, checked)}
                disabled={isCore || isMutating}
              />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
