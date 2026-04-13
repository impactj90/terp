'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDunningSettings, useUpdateDunningSettings } from '@/hooks'
import { toast } from 'sonner'

interface SettingsFormState {
  enabled: boolean
  maxLevel: number
  gracePeriodDays: number[]
  feeAmounts: number[]
  interestEnabled: boolean
  interestRatePercent: number
  feesEnabled: boolean
}

const DEFAULT_GRACE: Record<number, number[]> = {
  1: [7],
  2: [7, 14],
  3: [7, 14, 21],
  4: [7, 14, 21, 28],
}

const DEFAULT_FEES: Record<number, number[]> = {
  1: [0],
  2: [0, 2.5],
  3: [0, 2.5, 5],
  4: [0, 2.5, 5, 10],
}

function resizeArray(arr: number[], length: number, defaults: number[]): number[] {
  if (arr.length === length) return arr
  if (arr.length > length) return arr.slice(0, length)
  const out = [...arr]
  while (out.length < length) {
    out.push(defaults[out.length] ?? 0)
  }
  return out
}

export function DunningSettingsTab() {
  const t = useTranslations('billingDunning')
  const { data: settings, isLoading } = useDunningSettings()
  const updateMutation = useUpdateDunningSettings()

  const [form, setForm] = React.useState<SettingsFormState | null>(null)

  React.useEffect(() => {
    if (!settings) return
    const s = settings as SettingsFormState
    setForm({
      enabled: s.enabled,
      maxLevel: s.maxLevel,
      gracePeriodDays: [...s.gracePeriodDays],
      feeAmounts: [...s.feeAmounts],
      interestEnabled: s.interestEnabled,
      interestRatePercent: s.interestRatePercent,
      feesEnabled: s.feesEnabled,
    })
  }, [settings])

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        {t('loading')}
      </div>
    )
  }

  const update = <K extends keyof SettingsFormState>(
    key: K,
    value: SettingsFormState[K]
  ) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const setMaxLevel = (newLevel: number) => {
    setForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        maxLevel: newLevel,
        gracePeriodDays: resizeArray(
          prev.gracePeriodDays,
          newLevel,
          DEFAULT_GRACE[newLevel] ?? []
        ),
        feeAmounts: resizeArray(
          prev.feeAmounts,
          newLevel,
          DEFAULT_FEES[newLevel] ?? []
        ),
      }
    })
  }

  const updateGraceAt = (index: number, value: number) => {
    setForm((prev) => {
      if (!prev) return prev
      const next = [...prev.gracePeriodDays]
      next[index] = value
      return { ...prev, gracePeriodDays: next }
    })
  }

  const updateFeeAt = (index: number, value: number) => {
    setForm((prev) => {
      if (!prev) return prev
      const next = [...prev.feeAmounts]
      next[index] = value
      return { ...prev, feeAmounts: next }
    })
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        enabled: form.enabled,
        maxLevel: form.maxLevel,
        gracePeriodDays: form.gracePeriodDays,
        feeAmounts: form.feeAmounts,
        interestEnabled: form.interestEnabled,
        interestRatePercent: form.interestRatePercent,
        feesEnabled: form.feesEnabled,
      })
      toast.success(t('settings.savedSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.saveError'))
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.generalTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ds-enabled" className="text-sm font-medium">
                {t('settings.enabledLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.enabledHint')}
              </p>
            </div>
            <Switch
              id="ds-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => update('enabled', v)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ds-maxLevel">{t('settings.maxLevelLabel')}</Label>
            <Select
              value={String(form.maxLevel)}
              onValueChange={(v) => setMaxLevel(parseInt(v, 10))}
            >
              <SelectTrigger id="ds-maxLevel" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((l) => (
                  <SelectItem key={l} value={String(l)}>
                    {t('settings.levelOption', { level: l })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('settings.maxLevelHint')}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('settings.gracePeriodTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('settings.gracePeriodHint')}
          </p>
          {form.gracePeriodDays.map((days, i) => (
            <div key={i} className="flex items-center gap-3">
              <Label className="w-24 text-sm" htmlFor={`grace-${i}`}>
                {t('settings.levelLabel', { level: i + 1 })}
              </Label>
              <Input
                id={`grace-${i}`}
                type="number"
                min={0}
                max={365}
                value={days}
                onChange={(e) =>
                  updateGraceAt(i, parseInt(e.target.value || '0', 10))
                }
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">
                {t('settings.daysSuffix')}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.feesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="ds-feesEnabled" className="text-sm font-medium">
              {t('settings.feesEnabledLabel')}
            </Label>
            <Switch
              id="ds-feesEnabled"
              checked={form.feesEnabled}
              onCheckedChange={(v) => update('feesEnabled', v)}
            />
          </div>
          {form.feesEnabled && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t('settings.feesHint')}
              </p>
              {form.feeAmounts.map((amount, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Label className="w-24 text-sm" htmlFor={`fee-${i}`}>
                    {t('settings.levelLabel', { level: i + 1 })}
                  </Label>
                  <Input
                    id={`fee-${i}`}
                    type="number"
                    step="0.01"
                    min={0}
                    value={amount}
                    onChange={(e) =>
                      updateFeeAt(i, parseFloat(e.target.value || '0'))
                    }
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">EUR</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('settings.interestTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ds-interestEnabled" className="text-sm font-medium">
                {t('settings.interestEnabledLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.interestEnabledHint')}
              </p>
            </div>
            <Switch
              id="ds-interestEnabled"
              checked={form.interestEnabled}
              onCheckedChange={(v) => update('interestEnabled', v)}
            />
          </div>
          {form.interestEnabled && (
            <div className="space-y-2">
              <Label htmlFor="ds-rate">{t('settings.interestRateLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ds-rate"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.interestRatePercent}
                  onChange={(e) =>
                    update(
                      'interestRatePercent',
                      parseFloat(e.target.value || '0')
                    )
                  }
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">% p.a.</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          {t('settings.save')}
        </Button>
      </div>
    </div>
  )
}
